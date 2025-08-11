from flask import Flask, request, jsonify, send_from_directory
import random
import os

app = Flask(__name__)

# Define FAQ responses for Safe Trade Hub
faq_responses = {
    "how do i create an account": [
        "To create an account on Safe Trade Hub, simply click on the 'Sign Up' button on the homepage. You'll need to provide a valid email address, create a strong password, and verify your email. Once verified, you'll have full access to all platform features!"
    ],
    "what do i need to register on safe trade hub": [
        "To register on Safe Trade Hub, you need: a valid email address, a secure password, basic personal information (like your name and contact details), and a phone number for account verification (optional but recommended for added security)."
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

# Route for the home page (root URL)
@app.route('/')
def home():
    return "Welcome to Safe Trade Hub Chatbot! How can I assist you today?"

# Route for handling chatbot responses (POST)
@app.route('/chat', methods=['POST'])
def chat():
    data = request.get_json()  # Get JSON data from the frontend
    user_input = data.get('message', '')
    bot_response = chatbot_response(user_input)  # Get bot response
    return jsonify({'response': bot_response})  # Return response as JSON

# Route for handling favicon.ico requests (if you have a favicon)
@app.route('/favicon.ico')
def favicon():
    return send_from_directory(os.path.join(app.root_path, 'static'), 'favicon.ico')

if __name__ == '__main__':
    app.run(debug=True)
