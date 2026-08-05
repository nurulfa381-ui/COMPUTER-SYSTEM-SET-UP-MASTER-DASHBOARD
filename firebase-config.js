import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-app.js";

import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";

import {
  getFirestore,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDuLB8De88W-YZ8k4IMQN6ft9FcmB9Tz_M",
  authDomain: "computer-system-set-up.firebaseapp.com",
  projectId: "computer-system-set-up",
  storageBucket: "computer-system-set-up.firebasestorage.app",
  messagingSenderId: "295923403819",
  appId: "1:295923403819:web:0131bdc8220ee54b54ee6e"
};

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getFirestore(app);

async function ensureFirebaseLogin() {
  if (auth.currentUser) {
    return auth.currentUser;
  }

  const result =
    await signInAnonymously(auth);

  return result.user;
}

export {
  app,
  auth,
  db,
  serverTimestamp,
  ensureFirebaseLogin,
  onAuthStateChanged
};
