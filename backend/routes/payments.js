const express = require('express');
const router = express.Router();
const { body } = require('express-validator');

// Initialize Stripe only if secret key is provided
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
} else {
  console.warn('⚠️ Stripe secret key not provided. Payment features will be disabled.');
}

const { admin, collections } = require('../config/database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { asyncHandler, validationHandler, AppError } = require('../middleware/errorHandler');
const { logger, logTransaction } = require('../config/logger');

// Validation rules
const tokenDepositValidation = [
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be at least $0.01'),
  body('paymentMethod').isIn(['stripe', 'bank_transfer', 'crypto']).withMessage('Invalid payment method'),
  body('returnUrl').optional().isURL().withMessage('Return URL must be a valid URL')
];

// @desc    Deposit tokens to user wallet
// @route   POST /api/payments/deposit-tokens
// @access  Private
router.post('/deposit-tokens', authenticate, validationHandler(tokenDepositValidation), asyncHandler(async (req, res) => {
  const { amount, paymentMethod, returnUrl } = req.body;

  if (!stripe && paymentMethod === 'stripe') {
    throw new AppError('Stripe payment processing is not available. Stripe not configured.', 503);
  }

  const depositSessionId = `DEP-${Date.now()}-${req.user.id}`;

  try {
    let paymentResponse = {};

    switch (paymentMethod) {
      case 'stripe':
        // Create Stripe Checkout Session for token deposit
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          line_items: [{
            price_data: {
              currency: 'usd',
              product_data: {
                name: 'SafeTradeHub Tokens',
                description: `Add $${amount} to your wallet`,
              },
              unit_amount: Math.round(amount * 100), // Convert to cents
            },
            quantity: 1,
          }],
          mode: 'payment',
          success_url: `${returnUrl || process.env.FRONTEND_URL}/wallet?session_id={CHECKOUT_SESSION_ID}&status=success`,
          cancel_url: `${returnUrl || process.env.FRONTEND_URL}/wallet?status=cancelled`,
          metadata: {
            userId: req.user.id,
            depositSessionId,
            type: 'token_deposit'
          }
        });

        paymentResponse = {
          method: 'stripe',
          sessionId: session.id,
          url: session.url
        };
        break;

      case 'bank_transfer':
        // For bank transfer, provide bank details and pending status
        paymentResponse = {
          method: 'bank_transfer',
          bankDetails: {
            accountName: 'SafeTradeHub Ltd',
            accountNumber: '1234567890',
            routingNumber: '987654321',
            reference: depositSessionId
          },
          instructions: `Please transfer $${amount} to the account above with reference: ${depositSessionId}`
        };
        break;

      case 'crypto':
        // For crypto, provide wallet address (placeholder)
        paymentResponse = {
          method: 'crypto',
          walletAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', // Placeholder
          amount: amount,
          reference: depositSessionId,
          instructions: `Send exactly $${amount} worth of cryptocurrency to the address above with reference: ${depositSessionId}`
        };
        break;

      default:
        throw new AppError('Unsupported payment method', 400);
    }

    // Create pending deposit record
    const pendingDeposit = {
      id: depositSessionId,
      userId: req.user.id,
      amount,
      paymentMethod,
      status: 'pending',
      paymentResponse,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.FieldValue.serverTimestamp() // Add 24 hours
    };

    await collections.pendingDeposits.doc(depositSessionId).set(pendingDeposit);

    logTransaction('deposit_initiated', {
      userId: req.user.id,
      depositSessionId,
      amount,
      paymentMethod
    });

    res.json({
      success: true,
      message: 'Deposit initiated successfully',
      data: {
        depositSessionId,
        amount,
        paymentMethod,
        ...paymentResponse
      }
    });
  } catch (error) {
    logger.error('Token deposit initiation failed:', error);
    throw new AppError('Payment processing failed', 500);
  }
}));

// @desc    Complete Stripe token deposit
// @route   POST /api/payments/complete-stripe-deposit
// @access  Private
router.post('/complete-stripe-deposit', authenticate, asyncHandler(async (req, res) => {
  const { sessionId } = req.body;

  if (!stripe) {
    throw new AppError('Stripe not configured', 503);
  }

  if (!sessionId) {
    throw new AppError('Session ID is required', 400);
  }

  try {
    // Retrieve the session
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      throw new AppError('Payment not completed', 400);
    }

    const depositSessionId = session.metadata.depositSessionId;
    const userId = session.metadata.userId;

    // Verify user matches
    if (userId !== req.user.id) {
      throw new AppError('Unauthorized', 403);
    }

    // Check if already processed
    const pendingDepositDoc = await collections.pendingDeposits.doc(depositSessionId).get();
    if (!pendingDepositDoc.exists) {
      throw new AppError('Deposit session not found', 404);
    }

    const pendingDeposit = pendingDepositDoc.data();
    if (pendingDeposit.status === 'completed') {
      throw new AppError('Deposit already processed', 400);
    }

    const amount = session.amount_total / 100; // Convert from cents

    // Process the deposit using wallet API
    const walletResponse = await fetch(`${process.env.API_BASE_URL || 'http://localhost:5000'}/api/wallet/deposit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${req.token}`
      },
      body: JSON.stringify({
        amount,
        paymentMethod: 'card',
        paymentDetails: {
          method: 'stripe',
          sessionId,
          last4: session.payment_method_details?.card?.last4,
          brand: session.payment_method_details?.card?.brand
        }
      })
    });

    if (!walletResponse.ok) {
      throw new AppError('Failed to process wallet deposit', 500);
    }

    // Update pending deposit status
    await collections.pendingDeposits.doc(depositSessionId).update({
      status: 'completed',
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      stripeSessionId: sessionId
    });

    res.json({
      success: true,
      message: 'Deposit completed successfully',
      data: {
        amount,
        transactionId: depositSessionId
      }
    });
  } catch (error) {
    logger.error('Stripe deposit completion failed:', error);
    throw new AppError('Failed to complete deposit', 500);
  }
}));

// @desc    Create payment intent (legacy - for direct payments)
// @route   POST /api/payments/create-intent
// @access  Private
router.post('/create-intent', authenticate, asyncHandler(async (req, res) => {
  if (!stripe) {
    throw new AppError('Payment processing is not available. Stripe not configured.', 503);
  }

  const { amount, currency = 'usd', orderId } = req.body;

  if (!amount || amount <= 0) {
    throw new AppError('Invalid amount', 400);
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency,
      metadata: {
        orderId: orderId || '',
        userId: req.user.id
      }
    });

    logTransaction('payment_intent_created', {
      paymentIntentId: paymentIntent.id,
      amount,
      currency,
      orderId,
      userId: req.user.id
    });

    res.json({
      success: true,
      data: {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id
      }
    });
  } catch (error) {
    logger.error('Stripe payment intent creation failed:', error);
    throw new AppError('Payment processing failed', 500);
  }
}));

// @desc    Handle Stripe webhook
// @route   POST /api/payments/webhook
// @access  Public
router.post('/webhook', express.raw({type: 'application/json'}), asyncHandler(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    logger.error('Stripe webhook signature verification failed:', err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      logger.info('Payment succeeded:', paymentIntent.id);
      // Handle successful payment
      break;
    case 'payment_intent.payment_failed':
      const failedPayment = event.data.object;
      logger.warn('Payment failed:', failedPayment.id);
      // Handle failed payment
      break;
    default:
      logger.info(`Unhandled event type ${event.type}`);
  }

  res.json({received: true});
}));

// @desc    Get payment history
// @route   GET /api/payments/history
// @access  Private
router.get('/history', authenticate, asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;

  // Implementation for payment history
  res.json({
    success: true,
    data: {
      payments: [],
      pagination: {
        current: parseInt(page),
        pages: 0,
        total: 0,
        limit: parseInt(limit)
      }
    }
  });
}));

module.exports = router;