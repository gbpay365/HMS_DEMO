/** Common SOAP pick-lists for consultation — pick to insert, then elaborate in the text area. */

export const SOAP_CHIEF_COMPLAINTS = [
  {
    group: 'General & constitutional',
    items: [
      'Fever',
      'Chills / rigors',
      'Fatigue / weakness',
      'Weight loss',
      'Weight gain',
      'Loss of appetite',
      'Night sweats',
      'Generalized body pain',
      'Dizziness / lightheadedness',
      'Syncope / fainting',
    ]},
  {
    group: 'Head, ENT & neck',
    items: [
      'Headache',
      'Sore throat',
      'Ear pain',
      'Ear discharge',
      'Nasal congestion / rhinorrhea',
      'Sinus pain / pressure',
      'Neck pain / stiffness',
      'Hoarseness / voice change',
      'Difficulty swallowing',
      'Tooth / jaw pain',
    ]},
  {
    group: 'Eyes',
    items: [
      'Red eye',
      'Eye pain',
      'Blurred vision',
      'Double vision',
      'Eye discharge',
      'Itchy eyes',
      'Photophobia',
      'Foreign body sensation in eye',
    ]},
  {
    group: 'Cardiovascular',
    items: [
      'Chest pain',
      'Palpitations',
      'Shortness of breath on exertion',
      'Orthopnea / PND',
      'Leg swelling / edema',
      'Claudication',
    ]},
  {
    group: 'Respiratory',
    items: [
      'Cough',
      'Productive cough',
      'Shortness of breath',
      'Wheezing',
      'Hemoptysis',
      'Chest tightness',
    ]},
  {
    group: 'Gastrointestinal',
    items: [
      'Abdominal pain',
      'Nausea / vomiting',
      'Diarrhea',
      'Constipation',
      'Blood in stool',
      'Melena',
      'Heartburn / reflux',
      'Abdominal distension / bloating',
      'Jaundice',
      'Anal pain / bleeding',
    ]},
  {
    group: 'Genitourinary',
    items: [
      'Dysuria',
      'Urinary frequency / urgency',
      'Hematuria',
      'Flank pain',
      'Scrotal / testicular pain',
      'Vaginal discharge',
      'Pelvic pain',
      'Menorrhagia / irregular menses',
      'Amenorrhea',
      'Pregnancy-related concern',
    ]},
  {
    group: 'Musculoskeletal',
    items: [
      'Joint pain / swelling',
      'Back pain',
      'Neck pain',
      'Limb pain',
      'Muscle cramps',
      'Limited range of motion',
      'Trauma / injury',
    ]},
  {
    group: 'Neurological',
    items: [
      'Seizure',
      'Weakness / paralysis',
      'Numbness / tingling',
      'Tremor',
      'Confusion / altered mental status',
      'Speech difficulty',
      'Severe headache (thunderclap)',
      'Loss of consciousness',
    ]},
  {
    group: 'Dermatology',
    items: [
      'Rash / skin eruption',
      'Itching (pruritus)',
      'Skin lesion / growth',
      'Wound / ulcer',
      'Burn',
      'Insect bite / sting',
    ]},
  {
    group: 'Psychiatric & behavioral',
    items: [
      'Anxiety',
      'Depression / low mood',
      'Insomnia',
      'Agitation / aggression',
      'Suicidal ideation',
      'Substance use concern',
    ]},
  {
    group: 'Pediatric (common)',
    items: [
      'Crying / irritability (infant)',
      'Poor feeding (infant)',
      'Failure to thrive',
      'Convulsions (child)',
      'Ear pulling (child)',
    ]},
];

export const SOAP_HISTORY_SUBJECTIVE = [
  {
    group: 'Onset & course',
    items: [
      'Sudden onset',
      'Gradual onset over days',
      'Gradual onset over weeks',
      'Intermittent symptoms',
      'Progressive worsening',
      'Improving since onset',
      'No prior similar episodes',
      'Recurrent episodes',
    ]},
  {
    group: 'Associated symptoms',
    items: [
      'Associated fever',
      'Associated chills',
      'Associated nausea / vomiting',
      'Associated diarrhea',
      'Associated headache',
      'Associated cough',
      'Associated chest pain',
      'Associated dysuria',
      'Associated rash',
      'No associated symptoms',
    ]},
  {
    group: 'Past medical history',
    items: [
      'Known hypertension',
      'Known diabetes mellitus',
      'Known asthma / COPD',
      'Known HIV infection',
      'Known sickle cell disease',
      'Previous surgery — specify in notes',
      'Previous hospitalization — specify in notes',
      'No significant past medical history',
    ]},
  {
    group: 'Medications & allergies',
    items: [
      'On regular antihypertensives',
      'On antidiabetic medication',
      'On antiretroviral therapy (ART)',
      'No known drug allergies (NKDA)',
      'Penicillin allergy',
      'Sulfa allergy',
    ]},
  {
    group: 'Social & exposure',
    items: [
      'Recent travel history',
      'Contact with TB case',
      'Occupational exposure',
      'Tobacco use',
      'Alcohol use',
      'No sick contacts',
    ]},
  {
    group: 'Review of systems (negatives)',
    items: [
      'No fever',
      'No weight loss',
      'No night sweats',
      'No chest pain',
      'No shortness of breath',
      'No abdominal pain',
      'No urinary symptoms',
      'No neurological symptoms',
    ]},
];

export const SOAP_EXAMINATION_OBJECTIVE = [
  {
    group: 'General appearance',
    items: [
      'Well appearing, no acute distress',
      'Ill-appearing',
      'Febrile on examination',
      'Afebrile on examination',
      'Dehydrated',
      'Pale / anemic appearance',
      'Jaundiced',
      'Cyanosed',
    ]},
  {
    group: 'Vital signs',
    items: [
      'Vitals reviewed — within normal limits',
      'Tachycardia noted',
      'Bradycardia noted',
      'Hypertensive on examination',
      'Hypotensive on examination',
      'Febrile — temperature elevated',
      'Hypoxic — low SpO₂',
    ]},
  {
    group: 'HEENT',
    items: [
      'HEENT — unremarkable',
      'Pharyngeal erythema',
      'Tonsillar enlargement / exudate',
      'Cervical lymphadenopathy',
      'Conjunctival injection',
      'Otitis media findings',
      'Sinus tenderness',
    ]},
  {
    group: 'Cardiovascular',
    items: [
      'Regular rate and rhythm',
      'Murmur present — specify',
      'Gallop rhythm',
      'Peripheral edema present',
      'No peripheral edema',
      'JVP elevated',
    ]},
  {
    group: 'Respiratory',
    items: [
      'Clear breath sounds bilaterally',
      'Crackles / crepitations',
      'Wheezes',
      'Reduced air entry',
      'Dullness to percussion',
      'Increased work of breathing',
    ]},
  {
    group: 'Abdomen',
    items: [
      'Soft, non-tender, non-distended',
      'Tenderness — specify quadrant',
      'Guarding / rigidity',
      'Hepatomegaly',
      'Splenomegaly',
      'Bowel sounds normal',
      'Bowel sounds hypoactive',
    ]},
  {
    group: 'Neurological',
    items: [
      'Alert and oriented ×3',
      'GCS 15/15',
      'No focal neurological deficit',
      'Neck stiffness / meningism',
      'Cranial nerves intact',
      'Motor strength 5/5 all limbs',
      'Sensory examination normal',
    ]},
  {
    group: 'Musculoskeletal & skin',
    items: [
      'No joint swelling or deformity',
      'Joint swelling / tenderness — specify',
      'Normal range of motion',
      'Skin — no acute rash',
      'Maculopapular rash present',
      'Petechiae / purpura',
      'Wound — describe in notes',
    ]},
];

export const SOAP_ASSESSMENT_DIAGNOSIS = [
  {
    group: 'Infectious & tropical',
    items: [
      'Malaria — uncomplicated',
      'Malaria — severe (suspected)',
      'Upper respiratory tract infection (URTI)',
      'Lower respiratory tract infection / pneumonia',
      'Typhoid fever (suspected)',
      'Gastroenteritis / acute diarrhea',
      'Urinary tract infection (UTI)',
      'Sepsis (suspected)',
      'HIV-related illness — specify',
      'Tuberculosis (suspected)',
      'Meningitis (suspected)',
      'Dengue fever (suspected)',
    ]},
  {
    group: 'Cardiovascular & metabolic',
    items: [
      'Hypertension — uncontrolled',
      'Hypertension — controlled',
      'Type 2 diabetes mellitus',
      'Heart failure (suspected)',
      'Angina / ACS (suspected)',
      'Anemia — specify type in notes',
    ]},
  {
    group: 'Respiratory & ENT',
    items: [
      'Acute bronchitis',
      'Asthma exacerbation',
      'COPD exacerbation',
      'Acute pharyngitis / tonsillitis',
      'Acute otitis media',
      'Acute sinusitis',
    ]},
  {
    group: 'Gastrointestinal & hepatobiliary',
    items: [
      'Peptic ulcer disease (suspected)',
      'Acute gastritis',
      'Acute appendicitis (suspected)',
      'Hepatitis (suspected)',
      'Intestinal parasitosis',
      'Hemorrhoids',
    ]},
  {
    group: 'Musculoskeletal & trauma',
    items: [
      'Soft tissue injury / sprain',
      'Fracture (suspected) — specify site',
      'Low back pain — mechanical',
      'Osteoarthritis',
      'Rheumatoid arthritis (suspected)',
    ]},
  {
    group: 'Neurological & psychiatric',
    items: [
      'Tension headache',
      'Migraine',
      'Stroke / TIA (suspected)',
      'Epilepsy / seizure disorder',
      'Anxiety disorder',
      'Depressive disorder',
    ]},
  {
    group: 'Obstetric & gynecological',
    items: [
      'Normal pregnancy — routine ANC',
      'Threatened miscarriage (suspected)',
      'Pelvic inflammatory disease (suspected)',
      'Dysmenorrhea',
      'Menorrhagia',
    ]},
  {
    group: 'Dermatology & other',
    items: [
      'Allergic dermatitis',
      'Fungal skin infection',
      'Cellulitis (suspected)',
      'Dehydration',
      'Under investigation — pending results',
      'Stable chronic condition — follow-up',
    ]},
];
