// SafeLink Demo Data Store
const SafeLinkData = {
  currentUser: {
    id: "usr_101",
    name: "Ronak",
    role: "Student (Computer Science, 2rd Year)",
    phone: "+91 98765 43210",
    idVerified: true,
    badge: "ID Verified Student",
    avatar: "AS",
    homeLocation: "Green Park Heights, Block B",
    collegeLocation: "North Campus Central Library",
    privacySettings: {
      shareApproximateOnly: true,
      autoExpireJourney: true,
      allowCommunityAlerts: true,
      hideRealNameInPublicPings: true
    },
    batteryLevel: "88%",
    status: "Safe"
  },

  helperUser: {
    id: "hlp_204",
    name: "Rahul Verma",
    role: "Verified Campus Safety Marshal",
    phone: "+91 98123 45678",
    idVerified: true,
    badge: "Verified First Responder",
    avatar: "RV",
    rating: 4.95,
    distanceFromUser: "280m",
    status: "Available"
  },

  safeCircle: [
    {
      id: "sc_1",
      name: "Ronak",
      relation: "Parent",
      phone: "+91 98111 22334",
      active: true,
      initials: "M",
      color: "#48CAE4"
    },

    {
      id: "sc_3",
      name: "Kabir Sharma",
      relation: "Brother",
      phone: "+91 98333 44556",
      active: true,
      initials: "KS",
      color: "#FFD166"
    },
    {
      id: "sc_4",
      name: "Pooja (Roommate)",
      relation: "Dorm 4B Roommate",
      phone: "+91 98444 55667",
      active: true,
      initials: "PR",
      color: "#A2D2FF"
    }
  ],

  verifiedHelpers: [
    {
      id: "hlp_204",
      name: "Rahul Verma",
      role: "Campus Safety Marshal",
      credential: "First-Aid & Safety Certified",
      distance: "250m away",
      availability: "Available Now",
      status: "online",
      verifiedDate: "Aug 2025",
      rating: 4.9,
      badge: "Campus Marshal",
      x: 48,
      y: 52
    },
    {
      id: "hlp_205",
      name: "Dr. Maya Iyer",
      role: "Campus Clinic Physician",
      credential: "Medical Emergency Volunteer",
      distance: "420m away",
      availability: "Available Now",
      status: "online",
      verifiedDate: "Jan 2025",
      rating: 5.0,
      badge: "Medical Helper",
      x: 62,
      y: 35
    },
    {
      id: "hlp_206",
      name: "Priya Kapoor",
      role: "Graduate Teaching Assistant",
      credential: "Campus Community Watch",
      distance: "600m away",
      availability: "Available Now",
      status: "online",
      verifiedDate: "Nov 2025",
      rating: 4.8,
      badge: "Community Lead",
      x: 32,
      y: 68
    },
    {
      id: "hlp_207",
      name: "Arjun Sen",
      role: "Senior Student Council",
      credential: "CPR Certified",
      distance: "310m away",
      availability: "On Duty (Patrol)",
      status: "online",
      verifiedDate: "Oct 2025",
      rating: 4.9,
      badge: "Student Council",
      x: 55,
      y: 78
    },
    {
      id: "hlp_208",
      name: "Officer Rajesh",
      role: "Campus Police Liaison",
      credential: "Official University Security",
      distance: "750m away",
      availability: "Mobile Patrol",
      status: "patrol",
      verifiedDate: "Official",
      rating: 5.0,
      badge: "Campus Security",
      x: 75,
      y: 60
    },
    {
      id: "hlp_209",
      name: "Neha Gupta",
      role: "Hostel Warden Volunteer",
      credential: "Women's Safety Representative",
      distance: "530m away",
      availability: "Available",
      status: "online",
      verifiedDate: "Sep 2025",
      rating: 4.7,
      badge: "Warden Volunteer",
      x: 25,
      y: 30
    },
    {
      id: "hlp_210",
      name: "Security Post 3 (Kiosk)",
      role: "Static Security Post",
      credential: "Emergency Call Box #04",
      distance: "180m away",
      availability: "Staffed 24/7",
      status: "online",
      verifiedDate: "Official",
      rating: 5.0,
      badge: "Fixed Post",
      x: 40,
      y: 42
    }
  ],

  safePoints: [
    {
      id: "sp_1",
      name: "Campus Police Desk & 24/7 Hub",
      type: "police",
      category: "Police Station",
      distance: "350m",
      location: "Main Admin Gate",
      hours: "24/7 Always Open",
      verified: true,
      x: 36,
      y: 28
    },
    {
      id: "sp_2",
      name: "University Health Center & ER",
      type: "hospital",
      category: "Hospital / Clinic",
      distance: "580m",
      location: "Medical Enclave, Block C",
      hours: "24/7 Emergency Care",
      verified: true,
      x: 70,
      y: 40
    },
    {
      id: "sp_3",
      name: "Student Union Security Desk",
      type: "security",
      category: "College Security",
      distance: "140m",
      location: "Student Center Ground Floor",
      hours: "Open until 2:00 AM",
      verified: true,
      x: 44,
      y: 48
    },
    {
      id: "sp_4",
      name: "SafePoint: 24/7 Well-Lit Pharmacy",
      type: "assistance",
      category: "Public Safe Haven",
      distance: "450m",
      location: "University Metro Exit 2",
      hours: "24/7 CCTV Monitored",
      verified: true,
      x: 60,
      y: 72
    }
  ],

  adminStats: {
    activeUsers: 124,
    verifiedHelpers: 31,
    activeRequests: 2,
    resolvedRequests: 18
  },

  adminRequests: [
    {
      id: "#1024",
      area: "Campus North Gate",
      type: "Safety Concern",
      time: "2:31 PM",
      status: "Responding",
      user: "Aanya S.",
      responder: "Rahul V. (Marshal)",
      priority: "High"
    },
    {
      id: "#1023",
      area: "Metro Bus Stop",
      type: "Medical Assistance",
      time: "2:15 PM",
      status: "Resolved",
      user: "Tanmay M.",
      responder: "Dr. Maya I. (Clinic)",
      priority: "Emergency"
    },
    {
      id: "#1022",
      area: "Science Quad Walkway",
      type: "Need Escort",
      time: "1:40 PM",
      status: "Resolved",
      user: "Ritika P.",
      responder: "Security Kiosk #3",
      priority: "Moderate"
    },
    {
      id: "#1021",
      area: "Hostel Loop Road",
      type: "Suspicious Vehicle",
      time: "12:50 PM",
      status: "Resolved",
      user: "Meera D.",
      responder: "Officer Rajesh",
      priority: "High"
    },
    {
      id: "#1020",
      area: "Central Library East",
      type: "Feeling Unsafe",
      time: "11:15 AM",
      status: "Resolved",
      user: "Kavya J.",
      responder: "Rahul V.",
      priority: "Moderate"
    }
  ]
};

// Expose globally
window.SafeLinkData = SafeLinkData;
