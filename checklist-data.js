// ====== CHECKLIST DATA ======
// Each section has: id (unique key), title, icon, optional priority flag, and items[].
// Items can be plain strings or objects with {text, critical, input, inputLabel}.
const SECTIONS = [
  {
    id: 'ext_body', title: 'Fiberglass Body & Structure', icon: '🏠',
    items: [
      'Check entire exterior for delamination (bulges/bubbles)',
      'Inspect all seams and joints for proper caulking',
      'Examine for cracks, dents, or stress fractures',
      'Look for paint fading or discoloration',
      'Check corners and edges for separation',
      {text: 'CRITICAL: Check for any signs of roof leaks (common issue)', critical: true}
    ]
  },
  {
    id: 'roof', title: 'Roof System', icon: '🔝', priority: true,
    items: [
      'Inspect entire roof membrane for cracks, tears, or punctures',
      'Check all roof penetrations (vents, AC, antenna) for proper sealing',
      'Verify condition of roof-mounted AC unit',
      'Look for soft spots or sponginess (water intrusion)',
      'Check rubber roof material condition',
      'Inspect roof ladder mounting points'
    ]
  },
  {
    id: 'windows_doors', title: 'Windows & Doors', icon: '🪟',
    items: [
      'Test all windows open/close smoothly',
      'Check all window seals and weatherstripping',
      'Verify window latches and locks function',
      'Note: Windows are single-pane (less insulation)',
      'Check bedroom window crank (prone to failure)',
      'Verify entry door seal is intact',
      'Test door locks, latches, and deadbolt',
      'Check door alignment',
      'Inspect screen door and latch'
    ]
  },
  {
    id: 'tires', title: 'Tires & Wheels', icon: '🛞',
    items: [
      {text: 'Tire 1 DOT date / Condition', input: true, inputLabel: 'DOT date & condition'},
      {text: 'Tire 2 DOT date / Condition', input: true, inputLabel: 'DOT date & condition'},
      'Check for uneven wear, dry rot, sidewall cracks',
      {text: 'Verify tire pressure', input: true, inputLabel: 'L: ___ psi  R: ___ psi'},
      'Check tread depth (min 4/32")',
      'Inspect wheel bearings for play',
      'Check lug nuts for proper torque',
      'Examine brakes and pads',
      'Test electric brake connection'
    ]
  },
  {
    id: 'frame', title: 'Frame & Undercarriage', icon: '🔩',
    items: [
      'Inspect frame rails for rust or corrosion',
      'Check axles for alignment and damage',
      'Examine suspension components',
      'Check hitch and tongue area structure',
      'Test all four stabilizer jacks',
      'Test electric tongue jack operation',
      'Check battery box mounting',
      'Inspect underbelly liner for holes or tears',
      'Verify all mounting hardware secure'
    ]
  },
  {
    id: 'hitch', title: 'Hitch & Towing Components', icon: '🔗',
    items: [
      'Inspect hitch coupler (2-5/16" ball)',
      'Test coupler latch mechanism',
      'Check safety chains and mounting points',
      'Test breakaway switch and cable',
      'Test brake lights',
      'Test turn signals (left and right)',
      'Test running lights',
      'Test reverse lights',
      'Test 7-pin connector with tow vehicle'
    ]
  },
  {
    id: 'awning', title: 'Awning System', icon: '⛱️',
    items: [
      'Fully extend awning - operates smoothly',
      'Check fabric for tears, mildew, fading',
      'Test LED lighting in awning',
      'Test awning motor and controller',
      'Check awning wiring cover (prone to falling off)',
      'Verify mounting hardware secure',
      'Check arms extend and lock properly',
      'Test wind sensor if equipped'
    ]
  },
  {
    id: 'storage', title: 'Storage Compartments', icon: '📦',
    items: [
      'Open and test all exterior compartment latches',
      'Check for water stains or rust inside',
      'Verify doors seal properly',
      'Check hinges and gas struts',
      'Check propane compartment ventilation',
      'Test outdoor shower hose',
      'Check dump valve access'
    ]
  },
  {
    id: 'water_damage', title: 'Water Damage (Interior)', icon: '💧', priority: true,
    items: [
      {text: 'CRITICAL: Inspect entire ceiling for stains/soft spots', critical: true},
      'Check walls around all windows for moisture',
      {text: 'CRITICAL: Press floor throughout - check for soft spots', critical: true},
      'Look under dinette for sawdust (moisture damage)',
      'Look under bed for sawdust',
      'Check all corners and seams for separation',
      'Check cabinetry for water damage or swelling',
      'Check walls for proper attachment',
      {text: 'Moisture meter reading (if available)', input: true, inputLabel: 'Reading'}
    ]
  },
  {
    id: 'plumbing', title: 'Plumbing System', icon: '🚿',
    items: [
      'Check under kitchen sink - plumbing connections (common factory defect)',
      'Check under bathroom sink - plumbing connections',
      'Look for sawdust around sink plumbing',
      'Test kitchen sink faucet hot and cold',
      'Check kitchen faucet nozzle (prone to breakage)',
      'Test bathroom sink faucet hot and cold',
      'Check bathroom hot water knob (plastic, prone to breaking)',
      'Test shower on/off valve (common failure point)',
      'Turn on water pump - listen for proper operation',
      'Check for leaks while pump running',
      'Verify pump cycles and builds pressure',
      'Test city water connection',
      'Test outdoor shower',
      'Test toilet flush mechanism',
      'Check toilet hoses (proper length, not bent/kinked)'
    ]
  },
  {
    id: 'water_heater', title: 'Water Heater System', icon: '🔥',
    items: [
      'Access panel under bathroom sink',
      'Check wiring connections secure (often loose from factory)',
      'Test main inlet valve (common failure)',
      'Test electric mode (120V) - heats properly',
      'Test propane mode - ignites and heats',
      {text: 'Check water temperature reaches 120-140°F', input: true, inputLabel: 'Temp °F'},
      'Check for leaks around tank and connections',
      'Check relief valve condition',
      'Test bypass valve operation'
    ]
  },
  {
    id: 'tanks', title: 'Tank Systems', icon: '🪣',
    items: [
      'Test black tank valve (known to bind/fail)',
      'Test gray tank valve',
      'Check protective liner underneath',
      'Test tank sensors (if equipped)',
      'Check dump hose condition',
      'Check tank vent pipes on roof',
      'Look for leaks or staining around tanks'
    ]
  },
  {
    id: 'kitchen', title: 'Kitchen Appliances', icon: '🍳',
    items: [
      'Test refrigerator on electric mode (common cooling issues)',
      'Test refrigerator on propane mode',
      {text: 'Wait 2-4 hours - check temperature', input: true, inputLabel: 'Temp °F'},
      'Check refrigerator door seals and latches',
      'Check freezer cools adequately',
      'Test stove burner 1 on propane',
      'Test stove burner 2 on propane',
      'Test stove burner 3 on propane',
      'Check propane regulator (consistent flame)',
      'Test oven operation and temperature',
      'Test oven vent fan (fan blade secure on spindle)',
      'Test microwave/convection oven',
      'Check microwave door latch (opens while driving issue)',
      'Test range hood fan and light',
      'Test all kitchen cabinet/drawer mechanisms'
    ]
  },
  {
    id: 'climate', title: 'Climate Control', icon: '❄️',
    items: [
      'Test furnace on propane (inconsistency issues reported)',
      'Verify furnace ignites reliably',
      'Check airflow from all vents',
      'Run AC unit - verify cooling (13,500 BTU)',
      {text: 'Let AC run 15-20 min - temp drop', input: true, inputLabel: 'Temp drop °F'},
      'Listen for unusual AC noises',
      'Test all roof vents open/close',
      'Test fantastic fan (if equipped)',
      'Check all vent screens intact'
    ]
  },
  {
    id: 'electrical', title: 'Electrical System', icon: '⚡',
    items: [
      'Test ALL outlets with circuit tester (common power issues)',
      {text: 'Kitchen outlets', input: true, inputLabel: 'Status'},
      {text: 'Bathroom outlets', input: true, inputLabel: 'Status'},
      {text: 'Bedroom outlets', input: true, inputLabel: 'Status'},
      {text: 'Living area outlets', input: true, inputLabel: 'Status'},
      'Test converter/charger operation',
      'Test GFCI outlets and reset buttons',
      'Test all interior lights (LED flickering common)',
      'Test bathroom light specifically (frequent flickering)',
      'Verify 12V system functions',
      'Verify 120V system functions',
      {text: 'Test battery charging with multimeter', input: true, inputLabel: 'Voltage'},
      'Check battery condition and connections',
      'Check breaker panel - no tripped breakers',
      'Check for burnt wires or electrical smells',
      'Test USB charging ports',
      'Test all switches and dimmers'
    ]
  },
  {
    id: 'propane', title: 'Propane System', icon: '🔶',
    items: [
      'Test propane regulator at stove (pressure consistent)',
      'Check automatic changeover valve',
      'Inspect propane hoses (not too short or aggressively bent)',
      'Test propane detector alarm',
      'Check for propane smell',
      'Test stove on propane',
      'Test oven on propane',
      'Test water heater on propane',
      'Test furnace on propane',
      'Check propane tank mounting',
      'Check propane compartment ventilation',
      {text: 'Propane tank 1 cert date', input: true, inputLabel: 'Date'},
      {text: 'Propane tank 2 cert date', input: true, inputLabel: 'Date'}
    ]
  },
  {
    id: 'interior', title: 'Interior Features', icon: '🛋️',
    items: [
      'Test dinette table mechanisms',
      'Check cushion condition',
      'Open all cabinets - smooth operation',
      'Open all drawers - smooth operation',
      'Check pull-down shade holders (especially dinette - prone to loosening)',
      'Check window treatment mounting',
      'Test all cabinet latches',
      'Test bedroom vent fan',
      'Test TV mounting and connections',
      'Test AV system (AM/FM/CD/DVD/USB/Bluetooth)',
      'Inspect flooring for damage or stains',
      'Check upholstery for tears or stains'
    ]
  },
  {
    id: 'full_electrical', title: 'Full Electrical Test', icon: '🔌',
    items: [
      'Connect to 30-amp shore power',
      'Run AC + microwave + water heater simultaneously',
      'No breakers trip under load',
      {text: 'Check voltage at outlets (should be 110-120V)', input: true, inputLabel: 'Voltage'},
      {text: 'Check converter output (should be 13.2-13.8V)', input: true, inputLabel: 'Voltage'},
      'All systems maintain power'
    ]
  },
  {
    id: 'full_water', title: 'Full Water Test', icon: '💦',
    items: [
      'Connect to city water with pressure regulator',
      'Turn on all faucets - consistent pressure',
      'Water heater heats on electric',
      'Fill fresh water tank - test pump',
      'Run all fixtures simultaneously',
      'Check for any leaks throughout test'
    ]
  },
  {
    id: 'full_propane', title: 'Full Propane Test', icon: '🔥',
    items: [
      'Open propane tanks',
      'Test automatic changeover',
      'Run all propane appliances together',
      'No gas smell or hissing',
      'Propane detector stays quiet'
    ]
  },
  {
    id: 'docs', title: 'Documentation Review', icon: '📄',
    items: [
      'Request maintenance records',
      'Check warranty status (1-year limited from purchase date)',
      'Verify clean title - no liens/salvage',
      {text: 'VIN recall check', input: true, inputLabel: 'Results'},
      'Ask about winterization history',
      'Get list of modifications/repairs',
      'Obtain owner\'s manual and appliance manuals',
      'Review previous inspection reports (if any)'
    ]
  },
  {
    id: 'seller_q', title: 'Questions for Seller', icon: '🗣️',
    items: [
      {text: 'Has trailer ever leaked? Where? Repairs done?', input: true, inputLabel: 'Answer'},
      {text: 'Any warranty claims or repairs?', input: true, inputLabel: 'Answer'},
      {text: 'Storage method (covered/uncovered/climate-controlled)?', input: true, inputLabel: 'Answer'},
      {text: 'Maintenance performed (roof seal, bearings, etc.)?', input: true, inputLabel: 'Answer'},
      {text: 'Any known issues or concerns?', input: true, inputLabel: 'Answer'},
      {text: 'Reason for selling?', input: true, inputLabel: 'Answer'},
      {text: 'What\'s included (hoses, accessories)?', input: true, inputLabel: 'Answer'}
    ]
  },
  {
    id: 'red_flags', title: 'Red Flags - Dealbreakers', icon: '🚩', priority: true,
    items: [
      {text: 'Multiple roof leak locations', critical: true},
      {text: 'Plumbing with wrong fittings', critical: true},
      {text: 'Excessive sawdust under sinks', critical: true},
      {text: 'Black tank valve binding', critical: true},
      {text: 'Water heater not heating', critical: true},
      {text: 'Multiple appliance failures', critical: true},
      {text: 'Many broken plastic components', critical: true},
      {text: 'Severe LED flickering throughout', critical: true},
      {text: 'Improperly routed propane hoses', critical: true}
    ]
  },
  {
    id: 'tools', title: 'Tools Needed', icon: '🧰',
    items: [
      'Flashlight (bright LED)',
      'Multimeter or circuit tester',
      'Moisture meter (optional)',
      'Ladder for roof access',
      'Creeper or towel for undercarriage',
      'Camera/smartphone for photos',
      'This checklist',
      'Tire pressure gauge',
      'Level',
      'Gloves and knee pads'
    ]
  }
];
