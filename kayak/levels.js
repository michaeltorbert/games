// ═══════════════════════════════════════════════════════════════
// LEVEL DEFINITIONS
// ═══════════════════════════════════════════════════════════════
const LEVELS = [
  {
    name: 'Parque Jaime Duque',
    sub: 'Colombia 🇨🇴',
    stamp: '🕌',
    fact: 'Our first time kayaking together, even if it only lasted a few minutes, felt unexpectedly magical. We explored the zoo, watched the monkeys as a family, and climbed through the pirate ship like kids.',
    mapDot: [0.12, 0.62],
    waterColor: ['#3AA8D8','#1A6090'],
    skyColor: ['#3EB0E8','#7DD4F5'],
    bgColor: '#1a6b3a',
    collectibles: ['🌸','🌺','🦆','🪷','🐒','🥟','😘','☕','🌼','🍬'],
    drawScene: drawJaimeDuque
  },
  {
    name: 'Parque Simón Bolívar',
    sub: 'Bogotá, Colombia 🇨🇴',
    stamp: '🏛️',
    fact: 'A calm escape in the middle of a busy city, where we came back again and again. Flying kites, sharing a picnic, and playing with the ball together made it one of our favorite places.',
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
    fact: 'Our first beach trip together, with incredible views and simple homemade meals that somehow tasted better than anything else.',
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
    fact: 'Our first train journey, biking through the rain, and long scenic walks along the river. And somehow, the best macarons we’ve ever had.',
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
    fact: 'An unforgettable boat ride and the climb to the top of the rock, where everything went quiet for a moment, like we had paused the world just for ourselves.',
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
    fact: 'The best beach and some of the worst food, but the water made up for all of it. Walking together along the shore, feeling the sand between our toes, made it unforgettable.',
    mapDot: [0.22, 0.52],
    waterColor: ['#18D8C8','#0898A8'],
    skyColor: ['#60C8F8','#A0E0FF'],
    bgColor: '#0a4a6a',
    collectibles: ['🌴','🐚','🌺','🦀','😘','🍹','🐠','🩴','🏖️','🪸'],
    drawScene: drawPuntaCana
  },
  {
    name: 'Lazy River · Dreams Onyx',
    sub: 'Punta Cana, Dominican Republic 🇩🇴',
    stamp: '🌊',
    fact: 'Pulling each other along the lazy river, laughing as we went under the waterfall, it felt like everything in the world was exactly right.',
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
    fact: 'Our version of paradise, where the rest of the world disappeared and nothing else seemed to matter.',
    mapDot: [0.23, 0.535],
    waterColor: ['#10E0D0','#0898A8'],
    skyColor: ['#78D8F8','#B8EEFF'],
    bgColor: '#0a4858',
    collectibles: ['⭐','🐚','🌺','🦈','😘','🐠','🌴','🦀','🐟','🏝️'],
    drawScene: drawSaona
  },
  {
    name: 'Piscina Natural',
    sub: 'Dominican Republic 🇩🇴',
    stamp: '🌊',
    fact: 'Standing in crystal clear water surrounded by starfish, swimming through schools of fish, it almost didn’t feel real.',
    mapDot: [0.24, 0.54],
    waterColor: ['#08E8E0','#08A0B0'],
    skyColor: ['#80D8F8','#C0F0FF'],
    bgColor: '#084858',
    collectibles: ['⭐','🐠','🐡','🐟','🐚','💋','🪸','🌺','🤿'],
    drawScene: drawPiscinaNatural
  },
  {
    name: 'La Seine',
    sub: 'Paris, France 🇫🇷',
    stamp: '🗼',
    fact: 'Our perfect day in Paris, seeing everything at once: macarons, coffee, the Louvre, the Eiffel Tower, all in one unforgettable day.',
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
    collectibles: ['🥘','🍊','🌹','😘','💐','🥂','🌺','⭐','🍤','🪼'],
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
