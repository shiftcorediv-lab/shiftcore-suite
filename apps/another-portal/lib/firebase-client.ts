import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getAuth,
  getRedirectResult,
  inMemoryPersistence,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type Auth,
} from 'firebase/auth';

// Firebase Web設定は秘密情報ではない。APと同じプロジェクトを既定値にし、ホスト環境では上書きできる。
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyAXDhMT1IP1xQ9f0WiOIjmmfBHoQDWZ0dI',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'shiftcore-div.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'shiftcore-div',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'shiftcore-div.firebasestorage.app',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '882342275588',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:882342275588:web:bab610608d1bc00453e351',
};

let persistenceReady: Promise<void> | null = null;

export function getPortalAuth(): Auth {
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return getAuth(app);
}

export function preparePortalAuth(): Promise<void> {
  if (!persistenceReady) {
    const auth = getPortalAuth();
    persistenceReady = setPersistence(auth, browserLocalPersistence)
      .catch(() => setPersistence(auth, inMemoryPersistence))
      .then(() => getRedirectResult(auth))
      .then(() => undefined);
  }
  return persistenceReady;
}

export async function signInToPortal(): Promise<void> {
  await preparePortalAuth();
  const auth = getPortalAuth();
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
    if ([
      'auth/popup-blocked',
      'auth/operation-not-supported-in-this-environment',
      'auth/web-storage-unsupported',
    ].includes(code)) {
      await signInWithRedirect(auth, provider);
      return;
    }
    throw error;
  }
}

export async function signOutFromPortal(): Promise<void> {
  await signOut(getPortalAuth());
}
