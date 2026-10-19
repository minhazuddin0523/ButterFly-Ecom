import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where 
} from 'firebase/firestore';

// আপনার ফায়ারবেজ প্রজেক্টের আসল কনফিগারেশন
const firebaseConfig = {
  apiKey: "AIzaSyCTVSoogZX8DrapNPsap2iiw-rsY0tvkCE",
  authDomain: "butterfly-premium-mens-shirts.firebaseapp.com",
  projectId: "butterfly-premium-mens-shirts",
  storageBucket: "butterfly-premium-mens-shirts.firebasestorage.app",
  messagingSenderId: "441881367591",
  appId: "1:441881367591:web:ba3e8932fffa0a80366a02",
  measurementId: "G-8P63X6H183"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

// হেল্পার ফাংশন
export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);
export const loginWithEmail = (email: string, pass: string) => signInWithEmailAndPassword(auth, email, pass);
export const registerWithEmail = (email: string, pass: string) => createUserWithEmailAndPassword(auth, email, pass);
export const logoutUser = () => signOut(auth);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where
};