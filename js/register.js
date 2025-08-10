import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";


const firebaseConfig = {
  apiKey: "AIzaSyDHUkMJSSCm38bjMu5C2cLn0VdHmP8LYgA",
  authDomain: "safe-trade-hub.firebaseapp.com",
  projectId: "safe-trade-hub",
  storageBucket: "safe-trade-hub.appspot.com", // ✅ fix
  messagingSenderId: "128361296099",
  appId: "1:128361296099:web:9feb014f4ac9efa0f3d5d6"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// listen on the form submit (no need for a #submit id)
const form = document.getElementById("register-form");
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  try {
    const { user } = await createUserWithEmailAndPassword(auth, email, password);
    if (name) await updateProfile(user, { displayName: name });
    alert("Account created!");
    // window.location.href = "login.html";
  } catch (err) {
    const nice = {
      "auth/email-already-in-use": "This email is already registered.",
      "auth/invalid-email": "Please enter a valid email address.",
      "auth/weak-password": "Password should be at least 6 characters."
    };
    alert(nice[err.code] || err.message);
    console.error(err);
  }
});
