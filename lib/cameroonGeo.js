'use strict';

/** Cameroon regions → divisions → communes (patient address cascading). */
const regions = [
 "Adamawa",
 "Centre",
 "East",
 "Far North",
 "Littoral",
 "North",
 "North-West",
 "South",
 "South-West",
 "West"
];

const departments = {
 "Adamawa": [
  "Djérem",
  "Faro-et-Déo",
  "Mayo-Banyo",
  "Mbéré",
  "Vina"
 ],
 "Centre": [
  "Haute-Sanaga",
  "Lekié",
  "Mbam-et-Inoubou",
  "Mbam-et-Kim",
  "Méfou-et-Afamba",
  "Méfou-et-Akono",
  "Mfoundi",
  "Nyong-et-Kéllé",
  "Nyong-et-Mfoumou",
  "Nyong-et-So’o"
 ],
 "East": [
  "Boumba-et-Ngoko",
  "Haut-Nyong",
  "Kadey",
  "Lom-et-Djérem"
 ],
 "Far North": [
  "Diamaré",
  "Logone-et-Chari",
  "Mayo-Danay",
  "Mayo-Kani",
  "Mayo-Sava",
  "Mayo-Tsanaga"
 ],
 "Littoral": [
  "Moungo",
  "Nkam",
  "Sanaga-Maritime",
  "Wouri"
 ],
 "North": [
  "Bénoué",
  "Faro",
  "Mayo-Louti",
  "Mayo-Rey"
 ],
 "North-West": [
  "Boyo",
  "Bui",
  "Donga-Mantung",
  "Menchum",
  "Mezam",
  "Momo",
  "Ngo-Ketunjia"
 ],
 "South": [
  "Dja-et-Lobo",
  "Mvila",
  "Océan",
  "Vallée-du-Ntem"
 ],
 "South-West": [
  "Fako",
  "Koupé-Manengouba",
  "Lebialem",
  "Manyu",
  "Meme",
  "Ndian"
 ],
 "West": [
  "Bamboutos",
  "Haut-Nkam",
  "Hauts-Plateaux",
  "Koung-Khi",
  "Menoua",
  "Mifi",
  "Ndé",
  "Noun"
 ]
};

const communesDetailed = {
 "Centre": {
  "Mfoundi": [
   "Yaoundé I",
   "Yaoundé II",
   "Yaoundé III",
   "Yaoundé IV",
   "Yaoundé V",
   "Yaoundé VI",
   "Yaoundé VII",
   "Other council…"
  ],
  "Haute-Sanaga": [
   "Nanga-Eboko",
   "Minta",
   "Nsem",
   "Other council…"
  ],
  "Lekié": [
   "Monatélé",
   "Obala",
   "Okola",
   "Sa’a",
   "Other council…"
  ],
  "Mbam-et-Inoubou": [
   "Bafia",
   "Makénéné",
   "Nitoukou",
   "Other council…"
  ],
  "Mbam-et-Kim": [
   "Ntui",
   "Ngambé-Tikar",
   "Other council…"
  ],
  "Méfou-et-Afamba": [
   "Mfou",
   "Awae",
   "Edzendouan",
   "Soa",
   "Other council…"
  ],
  "Méfou-et-Akono": [
   "Ngoumou",
   "Akono",
   "Mbankomo",
   "Other council…"
  ],
  "Nyong-et-Kéllé": [
   "Bot Makak",
   "Éséka",
   "Makak",
   "Other council…"
  ],
  "Nyong-et-Mfoumou": [
   "Akonolinga",
   "Ayos",
   "Other council…"
  ],
  "Nyong-et-So’o": [
   "Mbalmayo",
   "Ngomedzap",
   "Other council…"
  ]
 },
 "Littoral": {
  "Wouri": [
   "Douala I",
   "Douala II",
   "Douala III",
   "Douala IV",
   "Douala V",
   "Douala VI",
   "Manjo?",
   "Other council…"
  ],
  "Moungo": [
   "Nkongsamba I",
   "Nkongsamba II",
   "Nkongsamba III",
   "Loum",
   "Penja",
   "Mbanga",
   "Other council…"
  ],
  "Sanaga-Maritime": [
   "Édéa I",
   "Édéa II",
   "Dizangué",
   "Pouma",
   "Other council…"
  ],
  "Nkam": [
   "Nkondjock",
   "Yabassi",
   "Other council…"
  ]
 },
 "West": {
  "Mifi": [
   "Bafoussam I",
   "Bafoussam II",
   "Bafoussam III",
   "Other council…"
  ],
  "Menoua": [
   "Dschang",
   "Fokoué",
   "Santchou",
   "Penka-Michel",
   "Other council…"
  ],
  "Noun": [
   "Foumban",
   "Koutaba",
   "Magba",
   "Massangam",
   "Other council…"
  ],
  "Bamboutos": [
   "Batcham",
   "Galim",
   "Other council…"
  ],
  "Haut-Nkam": [
   "Baham",
   "Batikam",
   "Other council…"
  ],
  "Hauts-Plateaux": [
   "Bahouan",
   "Other council…"
  ],
  "Koung-Khi": [
   "Kouoptamo",
   "Other council…"
  ],
  "Ndé": [
   "Bangangté",
   "Other council…"
  ]
 },
 "South-West": {
  "Fako": [
   "Buea",
   "Limbe I",
   "Limbe II",
   "Limbe III",
   "Tiko",
   "Muyuka",
   "Other council…"
  ],
  "Meme": [
   "Kumba I",
   "Kumba II",
   "Kumba III",
   "Other council…"
  ],
  "Koupé-Manengouba": [
   "Bangem",
   "Tombel",
   "Other council…"
  ],
  "Lebialem": [
   "Menji",
   "Other council…"
  ],
  "Manyu": [
   "Mamfe",
   "Other council…"
  ],
  "Ndian": [
   "Mundemba",
   "Other council…"
  ]
 },
 "North": {
  "Bénoué": [
   "Garoua I",
   "Garoua II",
   "Garoua III",
   "Other council…"
  ],
  "Faro": [
   "Poli",
   "Other council…"
  ],
  "Mayo-Louti": [
   "Guider",
   "Other council…"
  ],
  "Mayo-Rey": [
   "Tcholliré",
   "Other council…"
  ]
 },
 "Far North": {
  "Diamaré": [
   "Maroua I",
   "Maroua II",
   "Maroua III",
   "Other council…"
  ],
  "Logone-et-Chari": [
   "Kousséri",
   "Other council…"
  ],
  "Mayo-Danay": [
   "Yagoua",
   "Other council…"
  ],
  "Mayo-Kani": [
   "Kaélé",
   "Other council…"
  ],
  "Mayo-Sava": [
   "Mora",
   "Other council…"
  ],
  "Mayo-Tsanaga": [
   "Mokolo",
   "Other council…"
  ]
 },
 "Adamawa": {
  "Djérem": [
   "Tibati",
   "Other council…"
  ],
  "Faro-et-Déo": [
   "Tignère",
   "Other council…"
  ],
  "Mayo-Banyo": [
   "Banyo",
   "Other council…"
  ],
  "Mbéré": [
   "Meiganga",
   "Other council…"
  ],
  "Vina": [
   "Ngaoundéré",
   "Other council…"
  ]
 },
 "East": {
  "Boumba-et-Ngoko": [
   "Yokadouma",
   "Other council…"
  ],
  "Haut-Nyong": [
   "Abong-Mbang",
   "Other council…"
  ],
  "Kadey": [
   "Batouri",
   "Other council…"
  ],
  "Lom-et-Djérem": [
   "Bertoua",
   "Other council…"
  ]
 },
 "North-West": {
  "Boyo": [
   "Fundong",
   "Other council…"
  ],
  "Bui": [
   "Kumbo",
   "Other council…"
  ],
  "Donga-Mantung": [
   "Nkambé",
   "Other council…"
  ],
  "Menchum": [
   "Wum",
   "Other council…"
  ],
  "Mezam": [
   "Bamenda I",
   "Bamenda II",
   "Bamenda III",
   "Other council…"
  ],
  "Momo": [
   "Mbengwi",
   "Other council…"
  ],
  "Ngo-Ketunjia": [
   "Ndop",
   "Other council…"
  ]
 },
 "South": {
  "Dja-et-Lobo": [
   "Sangmélima",
   "Other council…"
  ],
  "Mvila": [
   "Ebolowa",
   "Other council…"
  ],
  "Océan": [
   "Kribi I",
   "Kribi II",
   "Other council…"
  ],
  "Vallée-du-Ntem": [
   "Ambam",
   "Other council…"
  ]
 }
};

const communes = {
 "Adamawa": {
  "Djérem": [
   "Tibati",
   "Other council…"
  ],
  "Faro-et-Déo": [
   "Tignère",
   "Other council…"
  ],
  "Mayo-Banyo": [
   "Banyo",
   "Other council…"
  ],
  "Mbéré": [
   "Meiganga",
   "Other council…"
  ],
  "Vina": [
   "Ngaoundéré",
   "Other council…"
  ]
 },
 "Centre": {
  "Haute-Sanaga": [
   "Nanga-Eboko",
   "Minta",
   "Nsem",
   "Other council…"
  ],
  "Lekié": [
   "Monatélé",
   "Obala",
   "Okola",
   "Sa’a",
   "Other council…"
  ],
  "Mbam-et-Inoubou": [
   "Bafia",
   "Makénéné",
   "Nitoukou",
   "Other council…"
  ],
  "Mbam-et-Kim": [
   "Ntui",
   "Ngambé-Tikar",
   "Other council…"
  ],
  "Méfou-et-Afamba": [
   "Mfou",
   "Awae",
   "Edzendouan",
   "Soa",
   "Other council…"
  ],
  "Méfou-et-Akono": [
   "Ngoumou",
   "Akono",
   "Mbankomo",
   "Other council…"
  ],
  "Mfoundi": [
   "Yaoundé I",
   "Yaoundé II",
   "Yaoundé III",
   "Yaoundé IV",
   "Yaoundé V",
   "Yaoundé VI",
   "Yaoundé VII",
   "Other council…"
  ],
  "Nyong-et-Kéllé": [
   "Bot Makak",
   "Éséka",
   "Makak",
   "Other council…"
  ],
  "Nyong-et-Mfoumou": [
   "Akonolinga",
   "Ayos",
   "Other council…"
  ],
  "Nyong-et-So’o": [
   "Mbalmayo",
   "Ngomedzap",
   "Other council…"
  ]
 },
 "East": {
  "Boumba-et-Ngoko": [
   "Yokadouma",
   "Other council…"
  ],
  "Haut-Nyong": [
   "Abong-Mbang",
   "Other council…"
  ],
  "Kadey": [
   "Batouri",
   "Other council…"
  ],
  "Lom-et-Djérem": [
   "Bertoua",
   "Other council…"
  ]
 },
 "Far North": {
  "Diamaré": [
   "Maroua I",
   "Maroua II",
   "Maroua III",
   "Other council…"
  ],
  "Logone-et-Chari": [
   "Kousséri",
   "Other council…"
  ],
  "Mayo-Danay": [
   "Yagoua",
   "Other council…"
  ],
  "Mayo-Kani": [
   "Kaélé",
   "Other council…"
  ],
  "Mayo-Sava": [
   "Mora",
   "Other council…"
  ],
  "Mayo-Tsanaga": [
   "Mokolo",
   "Other council…"
  ]
 },
 "Littoral": {
  "Moungo": [
   "Nkongsamba I",
   "Nkongsamba II",
   "Nkongsamba III",
   "Loum",
   "Penja",
   "Mbanga",
   "Other council…"
  ],
  "Nkam": [
   "Nkondjock",
   "Yabassi",
   "Other council…"
  ],
  "Sanaga-Maritime": [
   "Édéa I",
   "Édéa II",
   "Dizangué",
   "Pouma",
   "Other council…"
  ],
  "Wouri": [
   "Douala I",
   "Douala II",
   "Douala III",
   "Douala IV",
   "Douala V",
   "Douala VI",
   "Manjo?",
   "Other council…"
  ]
 },
 "North": {
  "Bénoué": [
   "Garoua I",
   "Garoua II",
   "Garoua III",
   "Other council…"
  ],
  "Faro": [
   "Poli",
   "Other council…"
  ],
  "Mayo-Louti": [
   "Guider",
   "Other council…"
  ],
  "Mayo-Rey": [
   "Tcholliré",
   "Other council…"
  ]
 },
 "North-West": {
  "Boyo": [
   "Fundong",
   "Other council…"
  ],
  "Bui": [
   "Kumbo",
   "Other council…"
  ],
  "Donga-Mantung": [
   "Nkambé",
   "Other council…"
  ],
  "Menchum": [
   "Wum",
   "Other council…"
  ],
  "Mezam": [
   "Bamenda I",
   "Bamenda II",
   "Bamenda III",
   "Other council…"
  ],
  "Momo": [
   "Mbengwi",
   "Other council…"
  ],
  "Ngo-Ketunjia": [
   "Ndop",
   "Other council…"
  ]
 },
 "South": {
  "Dja-et-Lobo": [
   "Sangmélima",
   "Other council…"
  ],
  "Mvila": [
   "Ebolowa",
   "Other council…"
  ],
  "Océan": [
   "Kribi I",
   "Kribi II",
   "Other council…"
  ],
  "Vallée-du-Ntem": [
   "Ambam",
   "Other council…"
  ]
 },
 "South-West": {
  "Fako": [
   "Buea",
   "Limbe I",
   "Limbe II",
   "Limbe III",
   "Tiko",
   "Muyuka",
   "Other council…"
  ],
  "Koupé-Manengouba": [
   "Bangem",
   "Tombel",
   "Other council…"
  ],
  "Lebialem": [
   "Menji",
   "Other council…"
  ],
  "Manyu": [
   "Mamfe",
   "Other council…"
  ],
  "Meme": [
   "Kumba I",
   "Kumba II",
   "Kumba III",
   "Other council…"
  ],
  "Ndian": [
   "Mundemba",
   "Other council…"
  ]
 },
 "West": {
  "Bamboutos": [
   "Batcham",
   "Galim",
   "Other council…"
  ],
  "Haut-Nkam": [
   "Baham",
   "Batikam",
   "Other council…"
  ],
  "Hauts-Plateaux": [
   "Bahouan",
   "Other council…"
  ],
  "Koung-Khi": [
   "Kouoptamo",
   "Other council…"
  ],
  "Menoua": [
   "Dschang",
   "Fokoué",
   "Santchou",
   "Penka-Michel",
   "Other council…"
  ],
  "Mifi": [
   "Bafoussam I",
   "Bafoussam II",
   "Bafoussam III",
   "Other council…"
  ],
  "Ndé": [
   "Bangangté",
   "Other council…"
  ],
  "Noun": [
   "Foumban",
   "Koutaba",
   "Magba",
   "Massangam",
   "Other council…"
  ]
 }
};

const villageDefaults = [
 "Other (specify)…"
];

const villageHints = {
 "Centre|Mfoundi|Yaoundé I": [
  "Bastos",
  "Tsinga",
  "Nlongkak",
  "Mokolo",
  "Other (specify)…"
 ],
 "Centre|Mfoundi|Yaoundé III": [
  "Efoulan",
  "Nsimeyong",
  "Mendong",
  "Other (specify)…"
 ],
 "Littoral|Wouri|Douala I": [
  "Akwa",
  "Bonanjo",
  "Deido",
  "Bali",
  "Other (specify)…"
 ],
 "Littoral|Wouri|Douala V": [
  "Bonaberi",
  "Makepe",
  "Logpom",
  "Other (specify)…"
 ],
 "West|Mifi|Bafoussam I": [
  "Banengo",
  "Tamdja",
  "Houngang",
  "Other (specify)…"
 ]
};

function getCameroonGeoPayload() {
  return { regions, departments, communes, villageDefaults, villageHints };
}

module.exports = {
  getCameroonGeoPayload,
};
