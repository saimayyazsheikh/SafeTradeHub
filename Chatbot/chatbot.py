import random

# Define FAQ responses for Safe Trade Hub
faq_responses = {
    "how do i create an account": [
        "To create an account on Safe Trade Hub, simply click on the 'Sign Up' button on the homepage. You'll need to provide a valid email address, create a strong password, and verify your email. Once verified, you'll have full access to all platform features!"
    ],
    "what do i need to register on safe trade hub": [
        "To register on Safe Trade Hub, you need: a valid email address, a secure password, basic personal information (like your name and contact details), and a phone number for account verification (optional but recommended for added security)."
    ],
    "how can i start a trade": [
        "To start a trade, log into your Safe Trade Hub account and go to the 'Marketplace' section. Select the item or service you want to trade, and click the 'Start Trade' button. You'll need to agree to the terms and conditions before proceeding."
    ],
    "what is the process for completing a trade": [
        "Once you've initiated a trade, the process goes as follows:\n1. Choose a Buyer/Seller: Select the appropriate party for the trade.\n2. Secure the Transaction: Both parties will confirm the terms of the trade, and the item will be held in escrow.\n3. Finalize the Trade: After the trade is completed, both parties will confirm that they are satisfied. The item is released, and the transaction is marked as complete."
    ],
    "can i cancel my trade after starting it": [
        "You can cancel your trade if it hasn't been accepted yet. Once the trade has been initiated and accepted by both parties, cancellation is not possible. However, you can contact customer support if you face any issues or need assistance."
    ],
    "how do i ensure my messages are secure": [
        "Safe Trade Hub uses end-to-end encryption for all in-app messaging, ensuring that your communication with other users is private and secure. Never share sensitive personal information like passwords or credit card details through chat. Always use the secure platform features to manage your transactions."
    ],
    "what security features are in place for my transactions": [
        "Safe Trade Hub employs multiple layers of security to protect your transactions:\n- Escrow System: Your trade item is held in escrow until both parties confirm completion.\n- Two-Factor Authentication (2FA): For added security, enable 2FA on your account to protect it from unauthorized access.\n- Data Encryption: All data, including messages and payment details, is encrypted to ensure confidentiality.\n- Fraud Protection: We monitor transactions for suspicious activity to help protect users from fraud."
    ],
    "how can i get help if i have issues": [
        "If you encounter any issues, you can visit our Help Center for troubleshooting guides, or you can reach out to our Customer Support team via the 'Contact Us' form in your account. We're here to assist you 24/7."
    ],
    "where can i report a problem": [
        "If you need to report a problem, go to your account settings and select 'Report a Problem.' You can also contact customer support directly through the 'Contact Us' page. Make sure to provide as many details as possible so we can resolve your issue quickly."
    ],
    "hello": [
        "Hi there! How can I assist you today?", 
        "Hello! How can I help you with your trade?", 
        "Greetings! How can I assist you today?"
    ],
    "bye": [
        "Goodbye! Feel free to reach out if you need help again.", 
        "See you later! Have a safe trade!", 
        "Take care! Don't hesitate to return if you have more questions."
    ],
    "how are you": [
        "I'm doing great, thanks for asking! How can I assist you today?", 
        "I'm here to help with any questions you might have!"
    ],
    "name": [
        "I am your friendly chatbot here to help with Safe Trade Hub!",
        "Call me Chatbot! I'm here to assist you with all your trade-related queries."
    ],
    "default": [
        "I'm not sure about that. Can you ask something else?", 
        "Sorry, I didn't quite catch that. Could you rephrase the question?", 
        "I'm still learning. Can you ask a different question?"
    ]
}

# Function to get the response based on user input
def chatbot_response(user_input):
    user_input = user_input.lower()  # Convert input to lowercase

    # Check if the input matches any of the predefined responses
    for key in faq_responses:
        if key in user_input:
            return random.choice(faq_responses[key])  # Return a random response from the list

    return random.choice(faq_responses["default"])  # If no match, return a default response

# Chat loop
print("Chatbot: Hello! Type 'exit' to end the conversation.")
while True:
    user_input = input("You: ")
    if user_input.lower() == 'exit':
        print("Chatbot: Goodbye!")
        break
    print("Chatbot:", chatbot_response(user_input))
