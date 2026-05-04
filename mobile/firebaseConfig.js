import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyBtOW_hCxAP4lMk_d2C88_diXW5UnS6lwM",
  authDomain: "agouliel-sign-in.firebaseapp.com",
  projectId: "agouliel-sign-in",
  storageBucket: "agouliel-sign-in.firebasestorage.app",
  messagingSenderId: "1039882731179",
  appId: "1:1039882731179:web:ae5eb52023a25a8e2c81ee"
};

const app = initializeApp(firebaseConfig);

// React Native needs AsyncStorage-backed persistence instead of browser localStorage
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});
