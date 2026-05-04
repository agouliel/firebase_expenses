import { useState, useEffect } from 'react';
import { View, Text, Image, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { GoogleAuthProvider, signInWithCredential, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebaseConfig';

WebBrowser.maybeCompleteAuthSession();

// Get this from: Firebase Console > Authentication > Sign-in method > Google >
// "Web SDK configuration" section > Web client ID
const WEB_CLIENT_ID = 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: WEB_CLIENT_ID,
    scopes: [
      'openid',
      'profile',
      'email',
      'https://www.googleapis.com/auth/calendar.readonly',
    ],
    extraParams: {
      access_type: 'offline',
      prompt: 'consent',
    },
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (response?.type !== 'success') return;
    const { authentication } = response;
    if (!authentication) return;

    const credential = GoogleAuthProvider.credential(
      authentication.idToken,
      authentication.accessToken
    );
    signInWithCredential(auth, credential).catch(console.error);

    // TODO: save tokens to backend once sign-in succeeds
    // auth.currentUser.getIdToken().then(idToken => {
    //   fetch('http://localhost:5001/api/save-calendar-token', {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
    //     body: JSON.stringify({
    //       tokens: {
    //         access_token: authentication.accessToken,
    //         refresh_token: authentication.refreshToken,
    //         expiry_date: Date.now() + authentication.expiresIn * 1000,
    //       }
    //     })
    //   });
    // });
  }, [response]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Expenses</Text>
      {!user ? (
        <Pressable
          style={[styles.button, !request && styles.buttonDisabled]}
          onPress={() => promptAsync()}
          disabled={!request}
        >
          <Text style={styles.buttonText}>Sign in with Google</Text>
        </Pressable>
      ) : (
        <View style={styles.userRow}>
          <Image source={{ uri: user.photoURL }} style={styles.avatar} />
          <Text style={styles.name}>{user.displayName}</Text>
          <Pressable style={styles.button} onPress={() => signOut(auth)}>
            <Text style={styles.buttonText}>Sign out</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1, padding: 40, paddingTop: 80 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 24 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  name: { flex: 1, fontSize: 16 },
  button: {
    backgroundColor: '#4285F4',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '600' },
});
