import { useState, useEffect } from 'react';
import { signInWithPopup, signOut, GoogleAuthProvider, onAuthStateChanged } from "firebase/auth";
import { auth, provider } from "./firebaseConfig";

function App() {
  const [user, setUser] = useState(null);
  const [events, setEvents] = useState(null);
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
      if (!response.ok) return;
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
            <img src={user.photoURL} width="40" style={{ borderRadius: '50%' }} referrerPolicy="no-referrer" />
            <p>Welcome, {user.displayName}</p>
            <button onClick={fetchCalendar} disabled={loading}>
              {loading ? "Loading..." : "Show My Calendar"}
            </button>
            <button onClick={() => signOut(auth)}>Sign out</button>
          </div>

          <div style={{ marginTop: '20px' }}>
            <h3>Expenses:</h3>
            {events ? (
              <table>
                <thead>
                  <tr>
                    <th>Category</th>
                    {events.months.map(([num, name]) => <th key={num}>{name}</th>)}
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(events.pivot).sort((a, b) => a.localeCompare(b)).map(cat => (
                    <tr key={cat}>
                      <td>#{cat}</td>
                      {events.months.map(([m]) => (
                        <td key={m}>
                          {events.pivot[cat][m] > 0 ? `€${events.pivot[cat][m]}` : '-'}
                        </td>
                      ))}
                      <td><strong>€{events.totals_by_category[cat]}</strong></td>
                    </tr>
                  ))}
                  <tr>
                    <td><strong>Total</strong></td>
                    {events.months.map(([m]) => (
                      <td key={m}>
                        <strong>{events.totals_by_month[m] > 0 ? `€${events.totals_by_month[m]}` : '-'}</strong>
                      </td>
                    ))}
                    <td><strong>€{Object.values(events.totals_by_category).reduce((s, v) => s + v, 0)}</strong></td>
                  </tr>
                </tbody>
              </table>
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
