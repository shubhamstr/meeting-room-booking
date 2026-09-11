export const initialCustomers = [
  {
    id: 'cust-1',
    name: 'Sarah Jenkins',
    email: 'sarah.jenkins@techpulse.io',
    phone: '+1 (555) 234-5678',
    company: 'TechPulse Solutions',
    department: 'Engineering',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    initials: 'SJ',
    badgeColor: '#6366f1'
  },
  {
    id: 'cust-2',
    name: 'Alexander Chen',
    email: 'alex.chen@innovate.co',
    phone: '+1 (555) 876-5432',
    company: 'Innovate Labs',
    department: 'Product & Design',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    initials: 'AC',
    badgeColor: '#0ea5e9'
  },
  {
    id: 'cust-3',
    name: 'Elena Rostova',
    email: 'elena.rostova@quantumventures.com',
    phone: '+1 (555) 345-6789',
    company: 'Quantum Ventures',
    department: 'Executive Board',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
    initials: 'ER',
    badgeColor: '#8b5cf6'
  },
  {
    id: 'cust-4',
    name: 'Marcus Vance',
    email: 'marcus.v@hypergrowth.ai',
    phone: '+1 (555) 901-2345',
    company: 'HyperGrowth AI',
    department: 'Marketing & Sales',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    initials: 'MV',
    badgeColor: '#10b981'
  },
  {
    id: 'cust-5',
    name: 'Priya Sharma',
    email: 'priya.sharma@nexusfintech.org',
    phone: '+1 (555) 456-7890',
    company: 'Nexus Fintech',
    department: 'Finance & Compliance',
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
    initials: 'PS',
    badgeColor: '#f59e0b'
  }
];

export const initialRooms = [
  {
    id: 'room-1',
    name: 'Apollo Executive Boardroom',
    floor: 'Floor 4 (North Wing)',
    capacity: 16,
    hourlyRate: 75,
    type: 'Boardroom',
    description: 'Executive conference room with 4K video conferencing, dual presentation screens, ergonomic seating, and city skyline views.',
    image: 'https://images.unsplash.com/photo-1517502884422-41eaead166d4?w=600&auto=format&fit=crop&q=80',
    amenities: ['4K Video Conferencing', 'Dual 75" Displays', 'Smart Whiteboard', 'Wireless Presentation', 'High-Speed Wi-Fi', 'Coffee Machine']
  },
  {
    id: 'room-2',
    name: 'Zenith Strategy Hub',
    floor: 'Floor 3 (East Wing)',
    capacity: 10,
    hourlyRate: 50,
    type: 'Meeting Room',
    description: 'Modern and collaborative space ideal for team sprint planning, client pitch meetings, and workshops.',
    image: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=600&auto=format&fit=crop&q=80',
    amenities: ['65" Ultra-HD Display', 'Interactive Whiteboard', 'Polycom Speakerphone', 'Glass Whiteboard Wall', 'High-Speed Wi-Fi']
  },
  {
    id: 'room-3',
    name: 'Nexus Creative Studio',
    floor: 'Floor 2 (Innovation Center)',
    capacity: 6,
    hourlyRate: 35,
    type: 'Creative Space',
    description: 'Bright, vibrant room designed for brainstorming, design sprints, and dynamic team discussions.',
    image: 'https://images.unsplash.com/photo-1497215842964-222b430dc094?w=600&auto=format&fit=crop&q=80',
    amenities: ['55" Presentation Screen', 'Magnetic Idea Wall', 'Acoustic Soundproofing', 'Wireless AirPlay/Cast', 'High-Speed Wi-Fi']
  },
  {
    id: 'room-4',
    name: 'Orion Focus Pod',
    floor: 'Floor 2 (Quiet Zone)',
    capacity: 4,
    hourlyRate: 25,
    type: 'Focus Room',
    description: 'Intimate, soundproof focus pod designed for 1-on-1 reviews, interview sessions, and private client calls.',
    image: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=600&auto=format&fit=crop&q=80',
    amenities: ['43" Video Monitor', 'High-Def Webcam & Mic', 'Soundproof Glass', 'High-Speed Wi-Fi']
  },
  {
    id: 'room-5',
    name: 'Cyber Summit Arena',
    floor: 'Floor 5 (Penthouse)',
    capacity: 30,
    hourlyRate: 120,
    type: 'Auditorium / Large Hall',
    description: 'High-capacity hall equipped for company all-hands, product launches, panel discussions, and hybrid webinars.',
    image: 'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=600&auto=format&fit=crop&q=80',
    amenities: ['Dual Laser Projectors', 'Surround Sound Audio', 'Live Stream System', 'Stage & Podium', 'Multi-Mic Setup', 'Refreshment Bar']
  }
];

export const allTimeSlots = [
  { id: '09:00-10:00', label: '09:00 AM - 10:00 AM', time: '09:00 AM', period: 'Morning' },
  { id: '10:00-11:00', label: '10:00 AM - 11:00 AM', time: '10:00 AM', period: 'Morning' },
  { id: '11:00-12:00', label: '11:00 AM - 12:00 PM', time: '11:00 AM', period: 'Morning' },
  { id: '12:00-13:00', label: '12:00 PM - 01:00 PM', time: '12:00 PM', period: 'Afternoon' },
  { id: '13:00-14:00', label: '01:00 PM - 02:00 PM', time: '01:00 PM', period: 'Afternoon' },
  { id: '14:00-15:00', label: '02:00 PM - 03:00 PM', time: '02:00 PM', period: 'Afternoon' },
  { id: '15:00-16:00', label: '03:00 PM - 04:00 PM', time: '03:00 PM', period: 'Afternoon' },
  { id: '16:00-17:00', label: '04:00 PM - 05:00 PM', time: '04:00 PM', period: 'Evening' },
  { id: '17:00-18:00', label: '05:00 PM - 06:00 PM', time: '05:00 PM', period: 'Evening' }
];

// Helper to get formatted date string YYYY-MM-DD
export function getTodayDateString(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

export const initialBookings = [
  {
    id: 'BK-1001',
    customerId: 'cust-1',
    customerName: 'Sarah Jenkins',
    customerCompany: 'TechPulse Solutions',
    roomId: 'room-1',
    roomName: 'Apollo Executive Boardroom',
    date: getTodayDateString(0),
    slotId: '10:00-11:00',
    slotLabel: '10:00 AM - 11:00 AM',
    title: 'Q3 Architectural Roadmap Review',
    attendees: 12,
    notes: 'Need projector and dual displays connected for Zoom bridge.',
    totalCost: 75,
    status: 'Confirmed',
    createdAt: new Date(Date.now() - 3600000 * 24).toISOString()
  },
  {
    id: 'BK-1002',
    customerId: 'cust-2',
    customerName: 'Alexander Chen',
    customerCompany: 'Innovate Labs',
    roomId: 'room-3',
    roomName: 'Nexus Creative Studio',
    date: getTodayDateString(0),
    slotId: '14:00-15:00',
    slotLabel: '02:00 PM - 03:00 PM',
    title: 'Mobile App UX Wireframe Critique',
    attendees: 5,
    notes: 'Whiteboard markers and sticky pads requested.',
    totalCost: 35,
    status: 'Confirmed',
    createdAt: new Date(Date.now() - 3600000 * 12).toISOString()
  },
  {
    id: 'BK-1003',
    customerId: 'cust-3',
    customerName: 'Elena Rostova',
    customerCompany: 'Quantum Ventures',
    roomId: 'room-2',
    roomName: 'Zenith Strategy Hub',
    date: getTodayDateString(1),
    slotId: '11:00-12:00',
    slotLabel: '11:00 AM - 12:00 PM',
    title: 'Investor Syndicate Pitch Session',
    attendees: 8,
    notes: 'High confidentiality required. Coffee service requested.',
    totalCost: 50,
    status: 'Confirmed',
    createdAt: new Date(Date.now() - 3600000 * 5).toISOString()
  }
];
