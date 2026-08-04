import { getApp, getApps, initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);

function auth() {
  if (!isFirebaseConfigured) throw new Error('Account creation is not configured yet. Add the Firebase values from .env.example.');
  const app = getApps().length ? getApp() : initializeApp(config);
  return getAuth(app);
}

export async function createFirebaseAccount(name: string, email: string, password: string) {
  const credential = await createUserWithEmailAndPassword(auth(), email, password);
  await updateProfile(credential.user, { displayName: name });
  return credential.user.getIdToken(true);
}

export async function signInWithFirebase(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(auth(), email, password);
  return credential.user.getIdToken(true);
}
