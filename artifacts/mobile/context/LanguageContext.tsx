import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

type Lang = "hi" | "en";

export const TRANSLATIONS = {
  hi: {
    home: "होम",
    wallet: "वॉलेट",
    schedule: "शेड्यूल",
    profile: "प्रोफाइल",
    history: "हिस्ट्री",
    where_going: "कहाँ जाना है?",
    book_ride: "राइड बुक करें",
    schedule_ride: "राइड शेड्यूल करें",
    wallet_balance: "वॉलेट बैलेंस",
    add_money: "पैसे जोड़ें",
    withdraw: "निकालें",
    earnings: "कमाई",
    kyc_documents: "KYC दस्तावेज़",
    upload_docs: "दस्तावेज़ अपलोड करें",
    driver_mode: "ड्राइवर मोड",
    go_online: "ऑनलाइन जाएं",
    go_offline: "ऑफलाइन जाएं",
    earnings_today: "आज की कमाई",
    total_rides: "कुल राइड्स",
    language: "भाषा",
    hindi: "हिंदी",
    english: "English",
    cancel: "रद्द करें",
    confirm: "पुष्टि करें",
    submit: "जमा करें",
    pending: "लंबित",
    approved: "स्वीकृत",
    rejected: "अस्वीकृत",
    min_amount: "न्यूनतम राशि ₹100",
    topup_success: "वॉलेट टॉप-अप सफल!",
    ride_booked: "राइड बुक हो गई!",
    scheduled_for: "के लिए शेड्यूल",
    no_scheduled: "कोई शेड्यूल राइड नहीं",
    aadhaar_front: "आधार फ्रंट",
    aadhaar_back: "आधार बैक",
    license_front: "लाइसेंस फ्रंट",
    license_back: "लाइसेंस बैक",
    rc_book: "RC बुक",
    selfie: "सेल्फी",
    kyc_pending: "KYC समीक्षाधीन",
    kyc_verified: "KYC सत्यापित ✅",
    kyc_rejected: "KYC अस्वीकृत ❌",
    withdrawal_method: "निकासी का तरीका",
    bank_account: "बैंक खाता",
    enter_upi: "UPI ID दर्ज करें",
    enter_account: "खाता नंबर दर्ज करें",
    commission_info: "6.7% कमीशन काटकर",
    your_share: "आपका हिस्सा 93.3%",
    good_morning: "शुभ प्रभात 🌅",
    good_afternoon: "शुभ दोपहर ☀️",
    good_evening: "शुभ संध्या 🌆",
    good_night: "शुभ रात्रि 🌙",
    quick_select: "जल्दी चुनें",
    recent_rides: "हाल की राइड्स",
    search_dest: "गंतव्य खोजें...",
    suggestion_office: "ऑफिस",
    suggestion_office_sub: "कनॉट प्लेस",
    suggestion_home: "घर",
    suggestion_home_sub: "सेक्टर 62, नोएडा",
    suggestion_airport: "एयरपोर्ट",
    suggestion_airport_sub: "T3, IGI एयरपोर्ट",
    profile_update: "प्रोफाइल अपडेट",
    pickup_location: "पिकअप लोकेशन",
    save: "सेव करें",
    logout: "लॉगआउट",
    remove: "हटाएं",
    name_label: "नाम",
    email_optional: "ईमेल (वैकल्पिक)",
    name_placeholder: "अपना नाम लिखें",
    pickup_placeholder: "जैसे — कनॉट प्लेस, नई दिल्ली",
    gps_label: "GPS से वर्तमान स्थान उपयोग करें",
    set_pickup: "📍 पिकअप सेट करें",
    enter_address: "अपना पिकअप पता टाइप करें",
    use_on_ride: "राइड पे उपयोग करें",
    recent_dlf: "DLF साइबर हब",
    recent_lajpat: "लाजपत नगर मार्केट",
    recent_hauz: "हौज खास विलेज",
    online: "ऑनलाइन",
    offline: "ऑफलाइन",
    go_offline_btn: "ऑफलाइन जाएं",
    go_online_btn: "ऑनलाइन जाएं",
  },
  en: {
    home: "Home",
    wallet: "Wallet",
    schedule: "Schedule",
    profile: "Profile",
    history: "History",
    where_going: "Where to?",
    book_ride: "Book Ride",
    schedule_ride: "Schedule Ride",
    wallet_balance: "Wallet Balance",
    add_money: "Add Money",
    withdraw: "Withdraw",
    earnings: "Earnings",
    kyc_documents: "KYC Documents",
    upload_docs: "Upload Documents",
    driver_mode: "Driver Mode",
    go_online: "Go Online",
    go_offline: "Go Offline",
    earnings_today: "Today's Earnings",
    total_rides: "Total Rides",
    language: "Language",
    hindi: "Hindi",
    english: "English",
    cancel: "Cancel",
    confirm: "Confirm",
    submit: "Submit",
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected",
    min_amount: "Minimum ₹100",
    topup_success: "Wallet top-up successful!",
    ride_booked: "Ride booked!",
    scheduled_for: "Scheduled for",
    no_scheduled: "No scheduled rides",
    aadhaar_front: "Aadhaar Front",
    aadhaar_back: "Aadhaar Back",
    license_front: "License Front",
    license_back: "License Back",
    rc_book: "RC Book",
    selfie: "Selfie",
    kyc_pending: "KYC Under Review",
    kyc_verified: "KYC Verified ✅",
    kyc_rejected: "KYC Rejected ❌",
    withdrawal_method: "Withdrawal Method",
    bank_account: "Bank Account",
    enter_upi: "Enter UPI ID",
    enter_account: "Enter Account Number",
    commission_info: "After 6.7% commission",
    your_share: "Your share is 93.3%",
    good_morning: "Good Morning 🌅",
    good_afternoon: "Good Afternoon ☀️",
    good_evening: "Good Evening 🌆",
    good_night: "Good Night 🌙",
    quick_select: "Quick Select",
    recent_rides: "Recent Rides",
    search_dest: "Search destination...",
    suggestion_office: "Office",
    suggestion_office_sub: "Connaught Place",
    suggestion_home: "Home",
    suggestion_home_sub: "Sector 62, Noida",
    suggestion_airport: "Airport",
    suggestion_airport_sub: "T3, IGI Airport",
    profile_update: "Profile Update",
    pickup_location: "Pickup Location",
    save: "Save",
    logout: "Logout",
    remove: "Remove",
    name_label: "Name",
    email_optional: "Email (optional)",
    name_placeholder: "Enter your name",
    pickup_placeholder: "e.g. Connaught Place, New Delhi",
    gps_label: "Use GPS current location",
    set_pickup: "📍 Set Pickup",
    enter_address: "Type your pickup address",
    use_on_ride: "Use on Ride",
    recent_dlf: "DLF Cyber Hub",
    recent_lajpat: "Lajpat Nagar Market",
    recent_hauz: "Hauz Khas Village",
    online: "Online",
    offline: "Offline",
    go_offline_btn: "Go Offline",
    go_online_btn: "Go Online",
  },
} as const;

type TranslationKey = keyof typeof TRANSLATIONS.hi;

interface LanguageContextType {
  lang: Lang;
  t: (key: TranslationKey) => string;
  toggleLanguage: () => void;
  setLang: (l: Lang) => void;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: "hi",
  t: (k) => TRANSLATIONS.hi[k],
  toggleLanguage: () => {},
  setLang: () => {},
});

const STORAGE_KEY = "raftaar_language";

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("hi");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v === "hi" || v === "en") setLangState(v);
    });
  }, []);

  const setLang = async (l: Lang) => {
    setLangState(l);
    await AsyncStorage.setItem(STORAGE_KEY, l);
  };

  const toggleLanguage = () => setLang(lang === "hi" ? "en" : "hi");

  const t = (key: TranslationKey): string => TRANSLATIONS[lang][key] ?? TRANSLATIONS.hi[key];

  return (
    <LanguageContext.Provider value={{ lang, t, toggleLanguage, setLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
