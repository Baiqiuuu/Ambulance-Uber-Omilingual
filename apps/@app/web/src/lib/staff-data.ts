
export interface Staff {
    id: string;
    name: string;
    role: string;
    languages: string[];
    department: string;
    isAvailable: boolean;
}

export const STAFF_MEMBERS: Staff[] = [
    {
        id: 'S1',
        name: 'Dr. Sarah Chen',
        role: 'Doctor',
        languages: ['en', 'zh', 'zh-chinese'],
        department: 'Emergency',
        isAvailable: true,
    },
    {
        id: 'S2',
        name: 'Nurse Maria Rodriguez',
        role: 'Nurse',
        languages: ['en', 'es', 'spanish'],
        department: 'Triage',
        isAvailable: true,
    },
    {
        id: 'S3',
        name: 'Dr. Ahmed Hassan',
        role: 'Doctor',
        languages: ['en', 'ar', 'arabic'],
        department: 'Cardiology',
        isAvailable: true,
    },
    {
        id: 'S4',
        name: 'Nurse Jean-Luc Picard',
        role: 'Nurse',
        languages: ['en', 'fr', 'french'],
        department: 'Emergency',
        isAvailable: true,
    },
    {
        id: 'S5',
        name: 'Dr. Priya Patel',
        role: 'Doctor',
        languages: ['en', 'hi', 'hindi', 'gu', 'gujarati'],
        department: 'Pediatrics',
        isAvailable: false,
    },
    {
        id: 'S6',
        name: 'Nurse Yuki Tanaka',
        role: 'Nurse',
        languages: ['en', 'ja', 'japanese'],
        department: 'ICU',
        isAvailable: true,
    },
    {
        id: 'S7',
        name: 'Dr. Igor Volkov',
        role: 'Doctor',
        languages: ['en', 'ru', 'russian'],
        department: 'Trauma',
        isAvailable: true,
    }
];

export function findStaffForLanguage(language: string): Staff | undefined {
    const normalizedLang = language.toLowerCase().trim();
    // Try to find available staff first
    return STAFF_MEMBERS.find(staff =>
        staff.isAvailable &&
        staff.languages.some(l => l.toLowerCase() === normalizedLang)
    ) || STAFF_MEMBERS.find(staff =>
        staff.languages.some(l => l.toLowerCase() === normalizedLang)
    );
}
