// ═══════════════════════════════════════════════════════════════
// LEVEL DEFINITIONS
// ═══════════════════════════════════════════════════════════════
const LEVELS = [
  {
    name: 'Parque Jaime Duque',
    sub: 'Colombia 🇨🇴',
    stamp: '🕌',
    fact: 'Parque Jaime Duque features a replica of the Taj Mahal built by eccentric aviator Jaime Duque in the 1980s — one of the most surreal sights in all of Colombia.',
    mapDot: [0.12, 0.62],
    waterColor: ['#3AA8D8','#1A6090'],
    skyColor: ['#3EB0E8','#7DD4F5'],
    bgColor: '#1a6b3a',
    collectibles: ['🌸','🌺','🦆','🪷','�','🥟','😘','☕','🌼','🍬'],
    drawScene: drawJaimeDuque
  },
  {
    name: 'Parque Simón Bolívar',
    sub: 'Bogotá, Colombia 🇨🇴',
    stamp: '🏛️',
    fact: 'The lake at Parque Simón Bolívar is the heart of Bogotá\'s largest urban park — locals call it "the lungs of the city" and paddle here on weekends surrounded by Andean peaks.',
    mapDot: [0.13, 0.63],
    waterColor: ['#4A9EC8','#1A5A80'],
    skyColor: ['#5AB8E8','#8ADAF8'],
    bgColor: '#2a5a3a',
    collectibles: ['☕','🌹','🎭','💐','😘','🍵','🌸','🥟','🚣','🪁','🧺'],
    drawScene: drawSimonBolivar
  },
  {
    name: 'Playa de Cartagena',
    sub: 'Cartagena, Colombia 🇨🇴',
    stamp: '🏖️',
    fact: 'Cartagena\'s walled old city is a UNESCO World Heritage site. The Caribbean waters here glow turquoise and the sunsets paint the colonial walls gold.',
    mapDot: [0.115, 0.58],
    waterColor: ['#20C8E0','#0888A8'],
    skyColor: ['#FFB040','#FF7820'],
    bgColor: '#1a4a6a',
    collectibles: ['🐚','🌺','💐','😘','🍹','🌊','⭐','🐠','🥟'],
    drawScene: drawCartagena
  },
  {
    name: 'Vltava River',
    sub: 'Prague, Czech Republic 🇨🇿',
    stamp: '🏰',
    fact: 'The Vltava winds through Prague past Gothic spires and the famous Charles Bridge, lined with Baroque statues. Pedal boats and kayaks share the river with graceful swans.',
    mapDot: [0.52, 0.28],
    waterColor: ['#4A7A9A','#2A4A6A'],
    skyColor: ['#8090A8','#B0C0D8'],
    bgColor: '#2a3a4a',
    collectibles: ['🦢','🥨','🍺','🌹','😘','💐','🌸','🚣‍♂️','🕰️','🥮','🪼','🚲'],
    drawScene: drawVltava
  },
  {
    name: 'Embalse del Peñol',
    sub: 'Guatapé, Colombia 🇨🇴',
    stamp: '⛰️',
    fact: 'The Embalse del Peñol is a vast artificial reservoir dotted with colourful painted islands — former hilltops flooded in 1978. El Peñón de Guatapé rock towers 220m overhead.',
    mapDot: [0.135, 0.63],
    waterColor: ['#2A88B8','#0A5888'],
    skyColor: ['#4AA8D8','#78C8F0'],
    bgColor: '#1a3a5a',
    collectibles: ['⛰️','🌺','💐','🎣','😘','☕','🦋','🌸','🍃','🚤','🪨'],
    drawScene: drawGuatape
  },
  {
    name: 'Playa Punta Cana',
    sub: 'Breathless Resort, Dominican Republic 🇩🇴',
    stamp: '🌴',
    fact: 'Punta Cana sits at the easternmost tip of Hispaniola where the Atlantic Ocean meets the Caribbean Sea — the beach stretches 48km of powdery white sand.',
    mapDot: [0.22, 0.52],
    waterColor: ['#18D8C8','#0898A8'],
    skyColor: ['#60C8F8','#A0E0FF'],
    bgColor: '#0a4a6a',
    collectibles: ['🌴','🐚','🌺','🦀','😘','🍹','�','🩴','🏖️','🪸'],
    drawScene: drawPuntaCana
  },
  {
    name: 'Lazy River · Dreams Onyx',
    sub: 'Punta Cana, Dominican Republic 🇩🇴',
    stamp: '🌊',
    fact: 'The Dreams Onyx lazy river winds through lush tropical gardens past swim-up bars and hidden grottos — the ultimate way to drift through paradise.',
    mapDot: [0.225, 0.525],
    waterColor: ['#20C0C0','#108080'],
    skyColor: ['#70D0F0','#A8E8FF'],
    bgColor: '#105050',
    collectibles: ['🍹','🌺','😘','💐','🦜','🌊','🥥','🍓','✨','🛟'],
    drawScene: drawLazyRiver
  },
  {
    name: 'Playa Toro · Saona Island',
    sub: 'Dominican Republic 🇩🇴',
    stamp: '🏝️',
    fact: 'Saona Island is a national park where starfish dot the sandbars in knee-deep water. The island appeared in a Club Med ad in the 1980s and has been a dream destination ever since.',
    mapDot: [0.23, 0.535],
    waterColor: ['#10E0D0','#0898A8'],
    skyColor: ['#78D8F8','#B8EEFF'],
    bgColor: '#0a4858',
    collectibles: ['⭐','🐚','🌺','🦈','😘','�','🌴','🦀','🐟','🏝️'],
    drawScene: drawSaona
  },
  {
    name: 'Piscina Natural',
    sub: 'Dominican Republic 🇩🇴',
    stamp: '🌊',
    fact: 'The Piscina Natural is a vast natural pool formed by coral reefs off the coast — shallow, crystalline, and teeming with tropical fish. You can wade here in waist-deep ocean water for hundreds of metres.',
    mapDot: [0.24, 0.54],
    waterColor: ['#08E8E0','#08A0B0'],
    skyColor: ['#80D8F8','#C0F0FF'],
    bgColor: '#084858',
    collectibles: ['⭐','🐠','🐡','🐟','🐚','💋','�','🌺','🤿'],
    drawScene: drawPiscinaNatural
  },
  {
    name: 'La Seine',
    sub: 'Paris, France 🇫🇷',
    stamp: '🗼',
    fact: 'The Seine flows 775km through the heart of Paris past the Eiffel Tower, Notre-Dame, and the Louvre. Bouquinistes have sold books along its banks since the 16th century.',
    mapDot: [0.475, 0.285],
    waterColor: ['#5A7A9A','#2A4A6A'],
    skyColor: ['#C8C0D8','#E8E0F0'],
    bgColor: '#2a2a4a',
    collectibles: ['🥐','🧁','🌹','🗼','😘','💐','🍷','🥖','💋'],
    drawScene: drawSeine
  },
  {
    name: 'Playa de la Malvarrosa',
    sub: 'Valencia, Spain 🇪🇸',
    stamp: '🌊',
    fact: 'La Malvarrosa is the beach that inspired Vicente Blasco Ibáñez\'s novel "Between Oranges and Waves." Today it\'s lined with paella restaurants — Valencia invented paella right here.',
    mapDot: [0.46, 0.315],
    waterColor: ['#2888C8','#0858A8'],
    skyColor: ['#F8B840','#F88820'],
    bgColor: '#1a3a6a',
    collectibles: ['🥘','🍊','🌹','😘','💐','🥂','🌺','⭐','�'],
    drawScene: drawMalvarrosa
  },
  {
    name: 'Rio Douro',
    sub: 'Porto, Portugal 🇵🇹',
    stamp: '🍷',
    fact: 'The Douro flows from Spain through Porto\'s dramatic gorge, lined with Rabelo boats that once carried port wine barrels from the Douro Valley vineyards to the city\'s famous wine lodges.',
    mapDot: [0.425, 0.31],
    waterColor: ['#6A7A5A','#3A4A3A'],
    skyColor: ['#E8A060','#D06030'],
    bgColor: '#3a2a1a',
    collectibles: ['🍷','🎸','🌹','😘','💐','🥐','🐟','🌸','🫒','🚤'],
    drawScene: drawDouro
  }
];

// Random bonus levels (after all 12 done)
const BONUS_STAMPS = ['🌍','🗺️','⚓','🌊','🏄','🚣'];
const BONUS_NAMES = ['Mystery Lagoon','Hidden Cove','Secret River','Lost Lake','The Blue Grotto','Enchanted Bay'];
