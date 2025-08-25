// Simple i18n module with runtime language switching and persistence
// Languages: en (English), ta (Tamil), hi (Hindi)
(function(){
  const messages = {
    en: {
      appTitle: 'ScrapCollect',
      logout: 'Logout',
      switchRole: 'Switch Role',
      back: 'Back',
  trackRequests: 'Track your pickup requests',
      welcome: 'Welcome to ScrapCollect',
      welcomeTag: 'Smart waste management made simple. Choose your role to get started:',
      customer: 'Customer',
      dealer: 'Dealer',
      admin: 'Admin',
      continueAsCustomer: 'Continue as Customer',
      continueAsDealer: 'Continue as Dealer',
      continueAsAdmin: 'Continue as Admin',
  requestPickup: 'Request Pickup',
  requestPickupDesc: 'Schedule a scrap collection',
  welcomeBack: 'Welcome Back!',
  myRequests: 'My Requests',
  myPickupRequests: 'My Pickup Requests',
      currentPrices: 'Current Scrap Prices',
      signIn: 'Sign in',
      phone: 'Phone number',
      role: 'Role',
      cancel: 'Cancel',
      confirm: 'Confirm',
      confirmAction: 'Confirm Action',
      confirmMessage: 'Are you sure you want to proceed?',
      language: 'Language'
  , noAssignedRequests: 'No requests assigned yet.'
  , requestIdPrefix: 'Request #'
  , noPickupRequests: 'No pickup requests found.'
  , assignedTo: 'Assigned to:'
  , estimatedValue: 'Estimated Value:'
  , getLocation: 'Get Current Location'
  , pleaseAddAtLeastOne: 'Please add at least one scrap item'
  , enterPhonePrompt: 'Enter phone number to login:'
  , loginRequired: 'Login required to proceed'
  , loggedInAs: 'Logged in as'
  , pleaseSelectDealer: 'Please select a dealer'
  , acceptAndStart: 'Accept & Start'
  , decline: 'Decline'
  , markCompleted: 'Mark Completed'
  , completed: 'Completed'
  , assignToDealer: 'Assign to Dealer'
  , assign: 'Assign'
    },
    ta: {
      appTitle: 'ஸ்கிராப்கலெக்ட்',
      logout: 'வெளியேறு',
      switchRole: 'பாத்திரம் மாற்று',
      back: 'பின்',
      welcome: 'ஸ்கிராப்கலெக்டுக்கு வரவேற்கிறோம்',
      welcomeTag: 'தொடங்க உங்கள் பாத்திரத்தைத் தேர்ந்தெடுக்கவும்',
      customer: 'வாடிக்கையாளர்',
      dealer: 'டீலர்',
      admin: 'நிர்வாகி',
      continueAsCustomer: 'வாடிக்கையாளராக தொடரவும்',
      continueAsDealer: 'டீலராக தொடரவும்',
      continueAsAdmin: 'நிர்வாகியாக தொடரவும்',
  requestPickup: 'பிக்கப் கோரிக்கை',
  requestPickupDesc: 'ஸ்கிராப் சேகரிப்பை திட்டமிடவும்',
  welcomeBack: 'மீண்டும் வரவேற்கிறோம்!',
  myRequests: 'என் கோரிக்கைகள்',
  myPickupRequests: 'என் பிக்கப் கோரிக்கைகள்',
      currentPrices: 'தற்போதைய ஸ்கிராப் விலைகள்',
      signIn: 'உள்நுழை',
      phone: 'தொலைபேசி எண்',
      role: 'பாத்திரம்',
      cancel: 'ரத்து',
      confirm: 'உறுதி',
      confirmAction: 'செயலை உறுதிசெய்',
      confirmMessage: 'நீங்கள் உறுதியாக உள்ளீர்களா?',
      language: 'மொழி'
  , noAssignedRequests: 'இனி வாய்ப்பு வாருகின்ற கோரிக்கைகள் இல்லை.'
  , requestIdPrefix: 'கோரிக்கை #'
  , noPickupRequests: 'எந்த பிக்கப் கோரிக்கைகளும் இல்லை.'
  , assignedTo: 'பதிவுசெய்யப்பட்டது:'
  , getLocation: 'தற்போதைய இடத்தைப் பெறவும்'
  , pleaseAddAtLeastOne: 'தயவுசெய்து குறைந்தது ஒரு ஸ்கிராப் உருப்படியைச் சேர்க்கவும்'
  , enterPhonePrompt: 'உள்நுழைய தொலைபேசி எண்ணை உள்ளிடவும்:'
  , loginRequired: 'தொடர login தேவை'
  , loggedInAs: 'உள்நுழைந்தவர்'
  , pleaseSelectDealer: 'தயவுசெய்து ஒரு டீலரை தேர்ந்தெடுக்கவும்'
  , acceptAndStart: 'ஈட்டவும் & தொடங்கவும்'
  , decline: 'நிராகரிக்கவும்'
  , markCompleted: 'முடிக்கப்பட்டதாக குறி'
  , completed: 'முடிக்கப்பட்டது'
  , assignToDealer: 'டீலருக்கு ஒதுக்கவும்'
  , assign: 'ஒதுக்கவும்'
    },
    hi: {
      appTitle: 'स्क्रैपकलेक्ट',
      logout: 'लॉगआउट',
      switchRole: 'भूमिका बदलें',
      back: 'वापस',
      welcome: 'स्क्रैपकलेक्ट में आपका स्वागत है',
      welcomeTag: 'शुरू करने के लिए अपनी भूमिका चुनें',
      customer: 'ग्राहक',
      dealer: 'डीलर',
      admin: 'एडमिन',
      continueAsCustomer: 'ग्राहक के रूप में जारी रखें',
      continueAsDealer: 'डीलर के रूप में जारी रखें',
      continueAsAdmin: 'एडमिन के रूप में जारी रखें',
  requestPickup: 'पिकअप का अनुरोध',
  requestPickupDesc: 'स्क्रैप संग्रह निर्धारित करें',
  welcomeBack: 'वापस स्वागत है!',
  myRequests: 'मेरे अनुरोध',
  myPickupRequests: 'मेरे पिकअप अनुरोध',
      currentPrices: 'वर्तमान स्क्रैप कीमतें',
      signIn: 'साइन इन',
      phone: 'फोन नंबर',
      role: 'भूमिका',
      cancel: 'रद्द करें',
      confirm: 'पुष्टि करें',
      confirmAction: 'क्रिया की पुष्टि करें',
      confirmMessage: 'क्या आप सुनिश्चित हैं?',
      language: 'भाषा'
  , noAssignedRequests: 'कोई अनुरोध असाइन नहीं हुए।'
  , requestIdPrefix: 'अनुरोध #'
  , noPickupRequests: 'कोई पिकअप अनुरोध नहीं मिला।'
  , assignedTo: 'सौंपा गया:'
  , getLocation: 'वर्तमान स्थान प्राप्त करें'
  , pleaseAddAtLeastOne: 'कृपया कम से कम एक स्क्रैप आइटम जोड़ें'
  , enterPhonePrompt: 'लॉगिन के लिए फोन नंबर दर्ज करें:'
  , loginRequired: 'आगे बढ़ने के लिए लॉगिन आवश्यक है'
  , loggedInAs: 'लॉगिन के रूप में'
  , pleaseSelectDealer: 'कृपया एक डीलर चुनें'
  , acceptAndStart: 'स्वीकार करें और शुरू करें'
  , decline: 'अस्वीकार'
  , markCompleted: 'समाप्त के रूप में चिह्नित करें'
  , completed: 'सम्पन्न'
  , assignToDealer: 'डीलर को असाइन करें'
  , assign: 'असाइन'
    }
  };

  const i18n = {
    lang: 'en',
    getUser: null,
    init(opts = {}){
      this.getUser = opts.getUser || null;
      try {
        const saved = localStorage.getItem('scrap_lang');
        if (saved && messages[saved]) this.lang = saved;
      } catch(e){}
      try {
        const u = this.getUser && this.getUser();
        if (u && u.language && messages[u.language]) this.lang = u.language;
      } catch(e){}
      document.documentElement.setAttribute('lang', this.lang);
    },
    t(key){
      const dict = messages[this.lang] || messages.en;
      return dict[key] || messages.en[key] || key;
    },
    setLanguage(lang){
      if (!messages[lang]) return;
      this.lang = lang;
      try { localStorage.setItem('scrap_lang', lang); } catch(e){}
      document.documentElement.setAttribute('lang', lang);
      this.applyToDOM();
      try {
        const u = this.getUser && this.getUser();
        if (u && u.phone) {
          fetch('/api/users/preferences', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: u.phone, language: lang })
          }).catch(()=>{});
        }
      } catch(e){}
    },
    applyToDOM(){
      document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (!key) return;
        const text = this.t(key);
        if (el.matches('input[placeholder], textarea[placeholder]')) {
          el.setAttribute('placeholder', text);
        } else {
          el.textContent = text;
        }
      });
      const map = { roleSelector: 'switchRole', backBtn: 'back', logoutBtnHeader: 'logout', logoutBtn: 'logout' };
      Object.keys(map).forEach(id => { const el = document.getElementById(id); if (el) el.textContent = this.t(map[id]); });
    }
  };

  window.i18n = i18n;
})();
