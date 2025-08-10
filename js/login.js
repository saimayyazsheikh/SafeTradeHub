// login.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDHUkMJSSCm38bjMu5C2cLn0VdHmP8LYgA",
  authDomain: "safe-trade-hub.firebaseapp.com",
  projectId: "safe-trade-hub",
  storageBucket: "safe-trade-hub.appspot.com",
  messagingSenderId: "128361296099",
  appId: "1:128361296099:web:9feb014f4ac9efa0f3d5d6"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Handle sign-in
const form = document.getElementById("login-form");
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;

    try {
      await signInWithEmailAndPassword(auth, email, password);
      alert("Signed in successfully!");
      // TODO: redirect wherever you want after login:
      // window.location.href = "dashboard.html";
    } catch (err) {
      // Helpful messages for common cases
      const messages = {
        "auth/invalid-email": "Please enter a valid email.",
        "auth/user-disabled": "This account has been disabled.",
        "auth/user-not-found": "No account found with this email.",
        "auth/wrong-password": "Incorrect password.",
        "auth/invalid-credential":
          "Email or password is incorrect. Please try again.",
        "auth/too-many-requests":
          "Too many attempts. Try again later or reset your password.",
      };
      alert(messages[err.code] || err.message);
      console.error(err);
    }
  });
}
