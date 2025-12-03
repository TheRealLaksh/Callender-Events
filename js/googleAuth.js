// js/googleAuth.js

let _googleAccessToken = null;
let _tokenExpiry = null;
let tokenClient = null;
let retryCount = 0;

// Initialize Google OAuth2 Token Client (Implicit Flow for Client-side Apps)
export function initGoogleSignIn() {
    // Retry mechanism to ensure Google Identity Services script is loaded
    if (!window.google || !google.accounts || !google.accounts.oauth2) {
        if (retryCount < 50) {
            retryCount++;
            setTimeout(initGoogleSignIn, 100);
        } else {
            console.warn('Google Identity Services failed to load after multiple attempts.');
        }
        return;
    }

    // 1. Initialize the Token Client
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: "815643307436-eqodkje0s365epames2jc4bcb2sq2lcp.apps.googleusercontent.com",
        scope: "https://www.googleapis.com/auth/calendar",
        callback: (response) => {
            if (response.access_token) {
                // Calculate expiry (default is 3599 seconds)
                const expiresIn = response.expires_in || 3600;
                const expiryTime = Date.now() + (expiresIn * 1000);
                
                setGoogleAccessToken(response.access_token, expiryTime);
                console.log('Google access token obtained');
                
                // Notify app
                window.dispatchEvent(new CustomEvent('app:googleConnected', { detail: { ok: true } }));
                
                // Persist to LocalStorage
                localStorage.setItem('google_access', JSON.stringify({ 
                    token: response.access_token, 
                    expiry: expiryTime 
                }));
                
                updateButtonUI(true);
            } else {
                console.error('No access token received', response);
                window.dispatchEvent(new CustomEvent('app:googleConnected', { detail: { ok: false, error: response } }));
            }
        },
    });

    // 2. Render the Button Container
    const container = document.getElementById("google-login");
    if (container) {
        container.innerHTML = ''; 
        
        const btn = document.createElement('button');
        btn.className = "flex items-center gap-2 transition shadow-sm border rounded-full font-medium text-sm px-4 py-2";
        
        btn.onclick = () => {
            if (tokenClient) {
                tokenClient.requestAccessToken();
            }
        };
        
        container.appendChild(btn);
        
        // Render the initial state immediately
        const isAlreadyConnected = !!getGoogleAccessToken();
        updateButtonUI(isAlreadyConnected);
    }
}

function updateButtonUI(isConnected) {
    const container = document.getElementById("google-login");
    if (!container) return;

    // Ensure we are targeting the button element, not text nodes
    const btn = container.querySelector('button');
    if (!btn) return;
    
    if (isConnected) {
        // Connected State
        btn.innerHTML = `<span class="text-emerald-600 font-bold">✓ Connected</span>`;
        btn.className = "flex items-center gap-2 bg-emerald-50 border-emerald-200 text-slate-900 px-4 py-2 rounded-full font-medium text-sm transition shadow-sm border";
    } else {
        // Disconnected / Default State
        btn.className = "flex items-center gap-2 bg-white text-slate-900 px-4 py-2 rounded-full font-medium text-sm hover:bg-gray-100 transition shadow-sm border border-slate-300";
        btn.innerHTML = `
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M23.52 12.29C23.52 11.43 23.44 10.61 23.3 9.82H12V14.44H18.46C18.17 15.96 17.3 17.25 16 18.11V21.16H19.88C22.15 19.07 23.52 15.99 23.52 12.29Z" fill="#4285F4"/>
                <path d="M12 24C15.24 24 17.96 22.92 19.88 21.16L16 18.11C14.93 18.84 13.56 19.26 12 19.26C8.87 19.26 6.22 17.15 5.27 14.28H1.26V17.39C3.17 21.19 7.25 24 12 24Z" fill="#34A853"/>
                <path d="M5.27 14.28C5.03 13.56 4.9 12.79 4.9 12C4.9 11.21 5.03 10.44 5.27 9.72V6.61H1.26C0.45 8.21 0 10.05 0 12C0 13.95 0.45 15.79 1.26 17.39L5.27 14.28Z" fill="#FBBC05"/>
                <path d="M12 4.74C13.76 4.74 15.34 5.35 16.58 6.54L19.98 3.14C17.96 1.26 15.24 0 12 0C7.25 0 3.17 2.81 1.26 6.61L5.27 9.72C6.22 6.85 8.87 4.74 12 4.74Z" fill="#EA4335"/>
            </svg>
            <span>Connect Google</span>
        `;
    }
}

export function setGoogleAccessToken(token, expiry = null) {
    _googleAccessToken = token;
    _tokenExpiry = expiry;
}

export function getGoogleAccessToken() {
    // If expired, clear
    if (_tokenExpiry && Date.now() > _tokenExpiry) {
        console.warn('Google token expired');
        _googleAccessToken = null;
        _tokenExpiry = null;
        localStorage.removeItem('google_access');
        
        updateButtonUI(false); 
        return null;
    }
    return _googleAccessToken;
}

// Restore token from localStorage if present on load
try {
    const stored = JSON.parse(localStorage.getItem('google_access') || 'null');
    if (stored && stored.token) {
        _googleAccessToken = stored.token;
        _tokenExpiry = stored.expiry || null;
        // Validate expiry immediately
        if (_tokenExpiry && Date.now() > _tokenExpiry) {
            _googleAccessToken = null;
            localStorage.removeItem('google_access');
        }
    }
} catch (e) {
    console.error('Error parsing stored token', e);
}

export default {
    initGoogleSignIn,
    getGoogleAccessToken,
    setGoogleAccessToken
};