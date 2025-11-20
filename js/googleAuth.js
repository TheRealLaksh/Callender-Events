let _googleAccessToken = null;
let _tokenExpiry = null;

// Initialize Google login button
export function initGoogleSignIn() {
    if (!window.google || !google.accounts || !google.accounts.id) {
        console.warn('Google Identity Services not loaded yet.');
        return;
    }
    google.accounts.id.initialize({
        client_id: "815643307436-eqodkje0s365epames2jc4bcb2sq2lcp.apps.googleusercontent.com",
        callback: handleGoogleCredential
    });

    google.accounts.id.renderButton(
        document.getElementById("google-login"),
        { theme: "filled_black", size: "large" }
    );
}

// Handle the credential response and exchange for access token
async function handleGoogleCredential(response) {
    const credential = response.credential;
    try {
        const res = await fetch(
            "https://oauth2.googleapis.com/token",
            {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    grant_type: "authorization_code",
                    code: credential,
                    client_id: "815643307436-eqodkje0s365epames2jc4bcb2sq2lcp.apps.googleusercontent.com",
                    redirect_uri: "postmessage"
                })
            }
        );
        const data = await res.json();
        if (data.access_token) {
            setGoogleAccessToken(data.access_token, data.expires_in ? Date.now() + (data.expires_in * 1000) : null);
            console.log('Google access token obtained');
            window.dispatchEvent(new CustomEvent('app:googleConnected', {detail: {ok: true}}));
            localStorage.setItem('google_access', JSON.stringify({ token: data.access_token, expiry: data.expires_in ? Date.now() + (data.expires_in*1000) : null }));
        } else {
            console.error('No access token received', data);
            window.dispatchEvent(new CustomEvent('app:googleConnected', {detail: {ok: false, error: data}}));
        }
    } catch (err) {
        console.error('Failed to exchange credential for token', err);
        window.dispatchEvent(new CustomEvent('app:googleConnected', {detail: {ok: false, error: err}}));
    }
}

export function setGoogleAccessToken(token, expiry = null) {
    _googleAccessToken = token;
    _tokenExpiry = expiry;
}

export function getGoogleAccessToken() {
    // if expired, clear
    if (_tokenExpiry && Date.now() > _tokenExpiry) {
        _googleAccessToken = null;
        _tokenExpiry = null;
        localStorage.removeItem('google_access');
    }
    return _googleAccessToken;
}

// restore token from localStorage if present
try {
    const stored = JSON.parse(localStorage.getItem('google_access') || 'null');
    if (stored && stored.token) {
        _googleAccessToken = stored.token;
        _tokenExpiry = stored.expiry || null;
    }
} catch (e) {
    // ignore
}

export default {
    initGoogleSignIn,
    getGoogleAccessToken,
    setGoogleAccessToken
};
