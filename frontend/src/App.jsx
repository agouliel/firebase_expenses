import { useState } from 'react';
import { signInWithPopup } from "firebase/auth";
import { auth, provider } from "./firebaseConfig";

function App() {
  const [user, setUser] = useState(null);

  const handleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, provider);
      const idToken = await result.user.getIdToken();
      
      // Store user info in state to update the UI
      setUser(result.user);

      // Send to your Express backend (running on port 5000)
      const response = await fetch("http://localhost:5001/api/data", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await response.json();
      alert(data.message);
    } catch (error) {
      console.error("Auth Error:", error);
    }
  };

  return (
    <div style={{ textAlign: 'center', marginTop: '50px' }}>
      <h1>Expenses</h1>
      {user ? (
        <div>
          <p>Welcome, {user.displayName}!</p>
          <img src={user.photoURL} alt="profile" style={{ borderRadius: '50%' }} />
        </div>
      ) : (
        <button onClick={handleLogin} style={{ padding: '10px 20px', cursor: 'pointer' }}>
          Sign in with Google
        </button>
      )}
    </div>
  );
}

export default App;