import { useState, useEffect } from 'react';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "firebase/auth";
import { auth, provider } from "./firebaseConfig";

function App() {
  const [user, setUser] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // This listens for the user's login status automatically
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false); // Once Firebase responds, stop loading
    });

    // Cleanup the listener on unmount
    return () => unsubscribe();
  }, []);

  const handleLoginAndSetup = async () => {
    const googleProvider = new GoogleAuthProvider();
    googleProvider.addScope('https://www.googleapis.com/auth/calendar.readonly');
    googleProvider.setCustomParameters({ access_type: 'offline', prompt: 'consent' });

    try {
      const result = await signInWithPopup(auth, googleProvider);

      const idToken = await result.user.getIdToken();

      // Grab the tokens from the response
      const tokens = {
        access_token: result._tokenResponse.oauthAccessToken,
        refresh_token: result._tokenResponse.refreshToken,
        expiry_date: Date.now() + (result._tokenResponse.oauthExpireIn * 1000)
      };

      // Save the Refresh Token to the backend
      await fetch("http://localhost:5001/api/save-calendar-token", {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}` 
        },
        body: JSON.stringify({ tokens })
      });

      setUser(result.user);
      
      //alert("Account linked with Calendar!");
      
    } catch (error) {
      console.error("Login Error:", error);
    }
  };

  const fetchCalendar = async () => {
    setLoading(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const response = await fetch("http://localhost:5001/api/calendar", {
        headers: { 'Authorization': `Bearer ${idToken}` }
      });
      const data = await response.json();
      setEvents(data);
    } catch (error) {
      console.error("Fetch Error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '40px', fontFamily: 'sans-serif' }}>
      <h1>Google Calendar Integration</h1>
      
      {!user ? (
        <button onClick={handleLoginAndSetup}>Login & Authorize Calendar</button>
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img src={user.photoURL} width="40" style={{ borderRadius: '50%' }} />
            <p>Welcome, {user.displayName}</p>
            <button onClick={fetchCalendar} disabled={loading}>
              {loading ? "Loading..." : "Show My Calendar"}
            </button>
          </div>

          <div style={{ marginTop: '20px' }}>
            <h3>Upcoming Events:</h3>
            {events.length > 0 ? (
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {events.map((event, i) => (
                  <li key={i} style={{ borderBottom: '1px solid #eee', padding: '10px 0' }}>
                    <strong>{event.summary}</strong> <br />
                    <small>{new Date(event.start.dateTime || event.start.date).toLocaleString()}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No events found or button not clicked yet.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
