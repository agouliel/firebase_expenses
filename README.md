# Convert to Expo

## Package changes                                                               
- Remove: react-dom, vite, all Vite plugins                                   
- Add: expo, react-native, expo-router (if you want navigation later)         
- Firebase auth: replace `signInWithPopup` with `expo-auth-session` + `@react-native-google-signin/google-signin`

## Code changes
All JSX elements must be replaced:                                            
- div/span -> View/Text                                                        
- img -> Image                                                                 
- button -> Pressable or TouchableOpacity
- select -> Picker or a custom modal picker                                    
- Expense table (table/tr/td) -> likely a FlatList or ScrollView with nested `View`s
                                                                                
CSS: replace `App.css` / `index.css` with `StyleSheet.create({})` objects inline.                                         

`firebaseConfig.js` stays mostly the same; Firebase JS SDK works in Expo. But Google Sign-In popup doesn't work on native - we need `expo-auth-session` to handle the OAuth redirect flow.
                  
## What's easy
- All useState / useEffect logic carries over unchanged
- fetch() calls to your backend work identically
- The overall component structure is simple (one file)

## Bottom line
Expo's approach requires setting up OAuth redirect URIs in your Google Cloud Console and Firebase project, and testing it on a real device or simulator rather than a browser popup.

---

Converting this to React Native (Expo) requires a shift from web-based logic (like Popups) to mobile-friendly patterns.

### Key Mobile Adjustments
*   **Table Logic:** We use a horizontal `ScrollView` to handle the wide pivot table, as mobile screens are too narrow for 14 columns (Category + 12 Months + Total).
*   **Picker:** We use `@react-native-picker/picker` (standard Expo practice).
*   **Auth:** Keep the logic placeholders, but remember that on mobile, you typically use `signInWithIdToken` after getting a token from the Google app.

```javascript
import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, Text, View, Image, ScrollView, 
  Pressable, ActivityIndicator, SafeAreaView 
} from 'react-native';
import { Picker } from '@react-native-picker/picker'; // Install: npx expo install @react-native-picker/picker
import { signOut, onAuthStateChanged, GoogleAuthProvider } from "firebase/auth";
import { auth } from "./firebaseConfig";

export default function App() {
  const [user, setUser] = useState(null);
  const [expenseData, setExpenseData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLoginAndSetup = async () => {
    // Note: Mobile uses expo-auth-session for Google. 
    // This is a placeholder for your existing logic structure.
    console.log("Trigger Google Auth Flow");
  };

  const fetchCalendar = async (yearOverride) => {
    const year = yearOverride ?? selectedYear;
    setLoading(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      // Use your machine's IP instead of localhost for physical device testing
      const response = await fetch(`http://192.168.1.XX:5001/api/calendar?year=${year}`, {
        headers: { 'Authorization': `Bearer ${idToken}` }
      });
      const data = await response.json();
      setExpenseData(data);
    } catch (error) {
      console.error("Fetch Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: currentYear - 2019 }, (_, i) => currentYear - i);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <Text style={styles.title}>Calendar Expenses</Text>

        {!user ? (
          <Pressable style={styles.button} onPress={handleLoginAndSetup}>
            <Text style={styles.buttonText}>Login & Authorize</Text>
          </Pressable>
        ) : (
          <View>
            {/* Header / User Info */}
            <View style={styles.userBar}>
              <Image 
                source={{ uri: user.photoURL }} 
                style={styles.avatar} 
              />
              <View style={styles.userInfo}>
                <Text style={styles.welcomeText}>Hello, {user.displayName}</Text>
                
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={selectedYear}
                    onValueChange={(val) => setSelectedYear(val)}
                    style={styles.picker}
                  >
                    {yearOptions.map(y => (
                      <Picker.Item key={y} label={y.toString()} value={y} />
                    ))}
                  </Picker>
                </View>
              </View>
            </View>

            {/* Actions */}
            <View style={styles.actionRow}>
              <Pressable 
                style={[styles.button, styles.flexBtn]} 
                onPress={() => fetchCalendar()}
                disabled={loading}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Show Table</Text>}
              </Pressable>

              <Pressable style={[styles.button, styles.logoutBtn]} onPress={() => signOut(auth)}>
                <Text style={styles.buttonText}>Sign Out</Text>
              </Pressable>
            </View>

            {/* Pivot Table Area */}
            <Text style={styles.subtitle}>Expenses Breakdown:</Text>
            {expenseData ? (
              <ScrollView horizontal>
                <View style={styles.table}>
                  {/* Table Header */}
                  <View style={[styles.tableRow, styles.tableHeader]}>
                    <Text style={[styles.cell, styles.headerCell, styles.fixedColumn]}>Category</Text>
                    {expenseData.months.map(([num, name]) => (
                      <Text key={num} style={[styles.cell, styles.headerCell]}>{name}</Text>
                    ))}
                    <Text style={[styles.cell, styles.headerCell]}>Total</Text>
                  </View>

                  {/* Category Rows */}
                  {Object.keys(expenseData.pivot).sort().map(cat => (
                    <View key={cat} style={styles.tableRow}>
                      <Text style={[styles.cell, styles.fixedColumn]}>#{cat}</Text>
                      {expenseData.months.map(([m]) => (
                        <Text key={m} style={styles.cell}>
                          {expenseData.pivot[cat][m] > 0 ? `€${expenseData.pivot[cat][m]}` : '-'}
                        </Text>
                      ))}
                      <Text style={[styles.cell, styles.bold]}>€{expenseData.totals_by_category[cat]}</Text>
                    </View>
                  ))}

                  {/* Footer Row */}
                  <View style={[styles.tableRow, styles.footerRow]}>
                    <Text style={[styles.cell, styles.fixedColumn, styles.bold]}>Total</Text>
                    {expenseData.months.map(([m]) => (
                      <Text key={m} style={[styles.cell, styles.bold]}>
                        {expenseData.totals_by_month[m] > 0 ? `€${expenseData.totals_by_month[m]}` : '-'}
                      </Text>
                    ))}
                    <Text style={[styles.cell, styles.bold]}>
                      €{Object.values(expenseData.totals_by_category).reduce((s, v) => s + v, 0)}
                    </Text>
                  </View>
                </View>
              </ScrollView>
            ) : (
              <Text style={styles.infoText}>Tap "Show Table" to load data.</Text>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContainer: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 20,
    marginBottom: 10,
  },
  userBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 12,
    marginBottom: 15,
    elevation: 2,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  userInfo: {
    marginLeft: 15,
    flex: 1,
  },
  welcomeText: {
    fontSize: 16,
    fontWeight: '500',
  },
  pickerContainer: {
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
  },
  picker: {
    height: 50,
    width: 150,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flexBtn: {
    flex: 2,
  },
  logoutBtn: {
    flex: 1,
    backgroundColor: '#FF3B30',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  infoText: {
    textAlign: 'center',
    marginTop: 40,
    color: '#666',
  },
  // Table Styling
  table: {
    backgroundColor: '#fff',
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  tableHeader: {
    backgroundColor: '#f8f8f8',
  },
  footerRow: {
    backgroundColor: '#f0f0f0',
  },
  cell: {
    width: 80,
    padding: 10,
    textAlign: 'center',
    fontSize: 12,
  },
  fixedColumn: {
    width: 100,
    textAlign: 'left',
    fontWeight: '600',
  },
  headerCell: {
    fontWeight: 'bold',
    color: '#333',
  },
  bold: {
    fontWeight: 'bold',
  },
});
```

---
## Scaffold the expo project
`npx create-expo-app@latest mobile --template blank`
(create-expo-app@3.5.3)

`cd mobile`   
`npx expo install firebase expo-auth-session expo-web-browser @react-native-async-storage/async-storage expo-crypto`   
`npm install --save firebase`

## Two files changed for OAuth
`firebaseConfig.js` - same config as the web app, but uses `initializeAuth` with `getReactNativePersistence(AsyncStorage)` instead of `getAuth`.
This is required because React Native has no browser localStorage.                             
                                                                              
`App.js` - replaces `signInWithPopup` with `expo-auth-session`'s `Google.useAuthRequest` + `signInWithCredential`.

The flow:
1. promptAsync() opens a browser tab for Google sign-in                       
2. On success, response.authentication contains idToken + accessToken         
3. Those are passed to GoogleAuthProvider.credential() -> signInWithCredential()                                                        
4. onAuthStateChanged picks up the signed-in user
                                                                                
The calendar token save is stubbed out in a comment.

---                                                                           

Before runnning it, one required setup step:

Get the Web Client ID:
1. Go to https://console.firebase.google.com > `agouliel-sign-in` project
2. Authentication > Sign-in method > Google > expand "Web SDK configuration"
3. Copy the Web client ID
4. Paste it into `mobile/App.js` replacing WEB_CLIENT_ID.apps.googleusercontent.com

Then add the Expo redirect URI to Google Cloud Console:
- Go to Google Cloud Console > APIs & Services > Credentials > the OAuth 2.0 client
- Under "Authorized redirect URIs", add: https://auth.expo.io/@agouliel/mobile

Then run it with `! cd mobile && npx expo start`.