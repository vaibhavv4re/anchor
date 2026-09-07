/**
 * Capability 1.3 - Kitchen & Chef Workspace: Actual Restaurant Menu Dataset
 * Canonical 69 Coastal Dishes from Anchor Menu Documentation (Reconciled).
 */

export const ACTUAL_ANCHOR_MENU = [
  {
    "id": "menu-item-sou-001",
    "itemCode": "MENU-SOU-001",
    "itemName": "Kokum & Coconut Soup",
    "category": "SOUPS",
    "dietaryType": "VEG",
    "sellingPrice": 240,
    "portionSize": "250ml",
    "spicinessLevel": "MEDIUM",
    "region": "Konkan / Maharashtra",
    "description": "A light coconut broth balanced with the refreshing tang of kokum, the treasured fruit of the Konkan coast.",
    "recipeNotes": "Hot sol kadhi variation - tangy creamy coconut sweetness and green chilly spice + coconut milk base",
    "routing": "KITCHEN_LINE",
    "recipeId": "rcp-9kdifhl"
  },
  {
    "id": "menu-item-sou-002",
    "itemCode": "MENU-SOU-002",
    "itemName": "Green Chicken Soup",
    "category": "SOUPS",
    "dietaryType": "NON_VEG",
    "sellingPrice": 280,
    "portionSize": "250ml",
    "spicinessLevel": "MEDIUM",
    "region": "Goa",
    "description": "Shredded chicken simmered with fresh coriander, mint and vegetables, inspired by Goa's vibrant Cafreal flavours.",
    "recipeNotes": "Cafreal style - vinegar & lemon tang and fresh green flavours of mint, coriander, ginger garlic cafreal masala + chicken broth base",
    "routing": "KITCHEN_LINE",
    "recipeId": "rcp-0nm3jf8"
  },
  {
    "id": "menu-item-sou-003",
    "itemCode": "MENU-SOU-003",
    "itemName": "Pepper Mutton Soup",
    "category": "SOUPS",
    "dietaryType": "NON_VEG",
    "sellingPrice": 320,
    "portionSize": "250ml",
    "spicinessLevel": "SPICY",
    "region": "Kerala / Tamil Nadu",
    "description": "A slow-cooked mutton broth infused with freshly cracked black pepper, honouring Cochin's centuries-old spice trade.",
    "recipeNotes": "Kerala mutton curry spice - whole black peppercorns, cloves, cinnamon, fried onion + paya broth base",
    "routing": "KITCHEN_LINE",
    "recipeId": "rcp-xm745yn",
    "hasVariants": true,
    "variants": [
      {
        "id": "var-1787571302168-1",
        "variantId": "var-1787571302168-1",
        "variantName": "Half",
        "price": 180,
        "sellingPrice": 180,
        "recipeId": "rcp-4l0hdks",
        "bomMode": "INDEPENDENT",
        "availabilityStatus": "AVAILABLE"
      },
      {
        "id": "var-1787571302168-2",
        "variantId": "var-1787571302168-2",
        "variantName": "Full",
        "price": 320,
        "sellingPrice": 320,
        "recipeId": "rcp-ss5d6vm",
        "bomMode": "DERIVED",
        "scalingFactor": 2.0,
        "availabilityStatus": "AVAILABLE"
      }
    ]
  },
  {
    "id": "menu-item-sou-004",
    "itemCode": "MENU-SOU-004",
    "itemName": "Coastal Karnataka Lentil Soup",
    "category": "SOUPS",
    "dietaryType": "VEG",
    "sellingPrice": 220,
    "portionSize": "250ml",
    "spicinessLevel": "MILD",
    "region": "Karnataka",
    "description": "Wholesome lentils gently simmered with vegetables, tamarind and roasted spices, inspired by Karnataka sambar.",
    "recipeNotes": "Mild sambar spice with carrots, cauliflower, tadka of curry leaves & mustard seeds + thin Tur dal base",
    "routing": "KITCHEN_LINE"
  },
  {
    "id": "menu-item-sou-005",
    "itemCode": "MENU-SOU-005",
    "itemName": "Tomato Soup",
    "category": "SOUPS",
    "dietaryType": "VEG",
    "sellingPrice": 210,
    "portionSize": "250ml",
    "spicinessLevel": "MILD",
    "region": "Konkan / Maharashtra",
    "description": "Roasted tomatoes, garlic, cumin and crushed peppercorns \u2014 a beloved coastal comfort.",
    "recipeNotes": "Tomato che saar style. Charred tomatoes, cumin, crushed peppercorns in ghee tadka",
    "routing": "KITCHEN_LINE",
    "recipeId": "rcp-ajgdpxm"
  },
  {
    "id": "menu-item-sou-006",
    "itemCode": "MENU-SOU-006",
    "itemName": "Captain's Hot Pot",
    "category": "SOUPS",
    "dietaryType": "NON_VEG",
    "sellingPrice": 340,
    "portionSize": "300ml",
    "spicinessLevel": "SPICY",
    "region": "Harbour Trade Routes",
    "description": "A bold seafood broth simmered with garlic, ginger, fresh chillies, vegetables and peppers.",
    "recipeNotes": "Robust seafood-forward broth with fresh seafood catch and coastal herbs",
    "routing": "KITCHEN_LINE"
  },
  {
    "id": "menu-item-str-001",
    "itemCode": "MENU-STR-001",
    "itemName": "Kokani Papad Basket",
    "category": "GARDEN & GRAIN",
    "dietaryType": "VEG",
    "sellingPrice": 180,
    "description": "Crispy fried papads made from jowar, bajra and ragi paired with our 3 signature house dips.",
    "routing": "KITCHEN_LINE"
  },
  {
    "id": "menu-item-str-002",
    "itemCode": "MENU-STR-002",
    "itemName": "Spicy Banana Donuts",
    "category": "GARDEN & GRAIN",
    "dietaryType": "VEG",
    "sellingPrice": 240,
    "description": "Savory raw banana and lentil fritters spiced with cumin, ginger and green chillies.",
    "routing": "KITCHEN_LINE"
  },
  {
    "id": "menu-item-str-003",
    "itemCode": "MENU-STR-003",
    "itemName": "Coastal Leaf Roll",
    "category": "GARDEN & GRAIN",
    "dietaryType": "VEG",
    "sellingPrice": 260,
    "description": "Steamed and crisped colocasia leaf pinwheels stuffed with spiced gram flour paste (Alu Vadi style).",
    "routing": "KITCHEN_LINE"
  },
  {
    "id": "menu-item-str-004",
    "itemCode": "MENU-STR-004",
    "itemName": "Stuffed Mushrooms",
    "category": "GARDEN & GRAIN",
    "dietaryType": "VEG",
    "sellingPrice": 290,
    "description": "Button mushrooms stuffed with spiced cottage cheese, herbs and slow-roasted coastal spices.",
    "routing": "KITCHEN_LINE"
  },
  {
    "id": "menu-item-str-005",
    "itemCode": "MENU-STR-005",
    "itemName": "Green Herb Paneer",
    "category": "GARDEN & GRAIN",
    "dietaryType": "VEG",
    "sellingPrice": 320,
    "description": "Fresh malai paneer cubes marinated in a vibrant Goan Cafreal herb paste and charcoal grilled.",
    "routing": "KITCHEN_LINE"
  },
  {
    "id": "menu-item-str-006",
    "itemCode": "MENU-STR-006",
    "itemName": "Smoked Damao Paneer",
    "category": "GARDEN & GRAIN",
    "dietaryType": "VEG",
    "sellingPrice": 340,
    "description": "Paneer skewers marinated in our signature Damao red spice blend, chargrilled with a gentle smoky glaze.",
    "routing": "KITCHEN_LINE"
  },
  {
    "id": "menu-item-str-007",
    "itemCode": "MENU-STR-007",
    "itemName": "Grilled Spicy Potatoes",
    "category": "GARDEN & GRAIN",
    "dietaryType": "VEG",
    "sellingPrice": 220,
    "description": "Baby potatoes parboiled and tossed in Byadgi chilli paste, garlic and mustard oil, finished on the griddle.",
    "routing": "KITCHEN_LINE"
  },
  {
    "id": "menu-item-str-008",
    "itemCode": "MENU-STR-008",
    "itemName": "Ghee Roast Vegetables",
    "category": "GARDEN & GRAIN",
    "dietaryType": "VEG",
    "sellingPrice": 340,
    "description": "Crispy seasonal vegetables tossed in Mangalorean ghee roast masala (SF0004) with fried curry leaves.",
    "routing": "KITCHEN_LINE"
  },
  {
    "id": "menu-item-str-009",
    "itemCode": "MENU-STR-009",
    "itemName": "Mustard Pepper Paneer",
    "category": "GARDEN & GRAIN",
    "dietaryType": "VEG",
    "sellingPrice": 340,
    "description": "Charcoal grilled paneer skewers glazed with Kasundi mustard and coarsely cracked Tellicherry black pepper.",
    "routing": "KITCHEN_LINE"
  },
  {
    "id": "menu-item-prw-001",
    "itemCode": "MENU-PRW-001",
    "itemName": "Prawns Koliwada",
    "category": "FROM THE SEA - PRAWNS",
    "dietaryType": "NON_VEG",
    "sellingPrice": 520,
    "description": "Fresh tiger prawns coated in ajwain, red chilli batter and deep-fried crisp Koliwada style.",
    "routing": "KITCHEN_LINE"
  },
  {
    "id": "menu-item-prw-002",
    "itemCode": "MENU-PRW-002",
    "itemName": "Butter Garlic Prawns",
    "category": "FROM THE SEA - PRAWNS",
    "dietaryType": "NON_VEG",
    "sellingPrice": 560,
    "description": "Tiger prawns pan-tossed in generous golden butter, minced garlic and fresh coastal herbs.",
    "routing": "KITCHEN_LINE"
  },
  {
    "id": "menu-item-prw-003",
    "itemCode": "MENU-PRW-003",
    "itemName": "Damao Masala Prawns",
    "category": "FROM THE SEA - PRAWNS",
    "dietaryType": "NON_VEG",
    "sellingPrice": 560,
    "description": "Juicy prawns simmered in signature Damao red masala with charred tomatoes and onions.",
    "routing": "KITCHEN_LINE"
  },
  {
    "id": "menu-item-prw-004",
    "itemCode": "MENU-PRW-004",
    "itemName": "Pickled Prawns",
    "category": "FROM THE SEA - PRAWNS",
    "dietaryType": "NON_VEG",
    "sellingPrice": 540,
    "description": "Prawns pan-seared in traditional Goan toddy vinegar, garlic and fiery peri-peri pickled spices.",
    "routing": "KITCHEN_LINE"
  },
  {
    "id": "menu-item-prw-005",
    "itemCode": "MENU-PRW-005",
    "itemName": "Ghee Roast Prawns",
    "category": "FROM THE SEA - PRAWNS",
    "dietaryType": "NON_VEG",
    "sellingPrice": 590,
    "description": "Tiger prawns slow-roasted in desi ghee with roasted Byadgi chillies and Mangalorean masala (SF0004).",
    "routing": "KITCHEN_LINE"
  },
  {
    "id": "menu-item-prw-006",
    "itemCode": "MENU-PRW-006",
    "itemName": "Mustard Pepper Prawns",
    "category": "FROM THE SEA - PRAWNS",
    "dietaryType": "NON_VEG",
    "sellingPrice": 560,
    "description": "Prawns chargrilled in a robust Kasundi mustard and cracked black pepper glaze.",
    "routing": "KITCHEN_LINE"
  },
  {
    "id": "menu-item-chk-001",
    "itemCode": "MENU-CHK-001",
    "itemName": "Classic Mamna Skewers",
    "category": "FROM THE SHORE - CHICKEN",
    "dietaryType": "NON_VEG",
    "sellingPrice": 380,
    "description": "Juicy chicken mince skewers seasoned with turmeric, ginger, garlic and green chillies, butter-glazed.",
    "routing": "KITCHEN_LINE"
  },
  {
    "id": "menu-item-chk-002",
    "itemCode": "MENU-CHK-002",
    "itemName": "Spiced Chourizo Skewers",
    "category": "FROM THE SHORE - CHICKEN",
    "dietaryType": "NON_VEG",
    "sellingPrice": 420,
    "description": "Chicken skewers infused with Goan chourizo-inspired smoked paprika, garlic and vinegar marinade.",
    "routing": "KITCHEN_LINE"
  },
  {
    "id": "menu-item-chk-003",
    "itemCode": "MENU-CHK-003",
    "itemName": "Smoked Damao Tikka",
    "category": "FROM THE SHORE - CHICKEN",
    "dietaryType": "NON_VEG",
    "sellingPrice": 420,
    "description": "Boneless chicken marinated in Damao red spice blend and charcoal grilled with a smoky finish.",
    "routing": "KITCHEN_LINE"
  },
  {
    "id": "menu-item-chk-004",
    "itemCode": "MENU-CHK-004",
    "itemName": "Kasundi Chicken Tikka",
    "category": "FROM THE SHORE - CHICKEN",
    "dietaryType": "NON_VEG",
    "sellingPrice": 420,
    "description": "Tender chicken tikka marinated in pungent Bengali Kasundi mustard and hung curd, grilled over coals.",
    "routing": "KITCHEN_LINE"
  },
  {
    "id": "menu-item-chk-005",
    "itemCode": "MENU-CHK-005",
    "itemName": "Green Herb Roasted Chicken",
    "category": "FROM THE SHORE - CHICKEN",
    "dietaryType": "NON_VEG",
    "sellingPrice": 440,
    "description": "Chicken pieces marinated in fresh mint, coriander and green chilli Cafreal masala, charcoal roasted.",
    "routing": "KITCHEN_LINE"
  },
  {
    "id": "menu-item-chk-006",
    "itemCode": "MENU-CHK-006",
    "itemName": "Whole Chicken Roast",
    "category": "FROM THE SHORE - CHICKEN",
    "dietaryType": "NON_VEG",
    "sellingPrice": 650,
    "description": "Whole chicken marinated in aromatic red coastal spices, charcoal roasted until smoky outside and juicy within.",
    "routing": "KITCHEN_LINE"
  },
  {
    "id": "menu-item-chk-007",
    "itemCode": "MENU-CHK-007",
    "itemName": "Ghee Roast Chicken",
    "category": "FROM THE SHORE - CHICKEN",
    "dietaryType": "NON_VEG",
    "sellingPrice": 440,
    "description": "Chicken pan-seared in rich Mangalorean ghee roast masala (SF0004) and desi ghee, bold and smoky.",
    "routing": "KITCHEN_LINE"
  },
  {
    "id": "menu-item-chk-008",
    "itemCode": "MENU-CHK-008",
    "itemName": "Malabari Pepper Chicken",
    "category": "FROM THE SHORE - CHICKEN",
    "dietaryType": "NON_VEG",
    "sellingPrice": 420,
    "description": "Pan-seared chicken with coarsely cracked Malabar black peppercorns, cumin and fennel.",
    "routing": "KITCHEN_LINE"
  },
  {
    "id": "menu-item-chk-009",
    "itemCode": "MENU-CHK-009",
    "itemName": "Malvani Chicken Sukka",
    "category": "FROM THE SHORE - CHICKEN",
    "dietaryType": "NON_VEG",
    "sellingPrice": 440,
    "description": "Chicken cooked dry with roasted fresh coconut, dried red chillies and Malvani aromatic spices.",
    "routing": "KITCHEN_LINE"
  },
  {
    "id": "menu-item-chk-010",
    "itemCode": "MENU-CHK-010",
    "itemName": "Spiced Chicken Lollipops",
    "category": "FROM THE SHORE - CHICKEN",
    "dietaryType": "NON_VEG",
    "sellingPrice": 380,
    "description": "Crispy fried chicken wings marinated in tangy Goan Recheado spice paste and vinegar.",
    "routing": "KITCHEN_LINE"
  },
  {
    "id": "menu-item-chk-011",
    "itemCode": "MENU-CHK-011",
    "itemName": "Chilli Chicken Wings",
    "category": "FROM THE SHORE - CHICKEN",
    "dietaryType": "NON_VEG",
    "sellingPrice": 360,
    "description": "Crispy chicken wings wok-tossed with fresh chillies, garlic and coastal Indo-Chinese glaze.",
    "routing": "KITCHEN_LINE"
  },
  {
    "id": "menu-item-chk-012",
    "itemCode": "MENU-CHK-012",
    "itemName": "Andhra Chicken Wings",
    "category": "FROM THE SHORE - CHICKEN",
    "dietaryType": "NON_VEG",
    "sellingPrice": 360,
    "description": "Batter-fried chicken wings wok-tossed with fiery Guntur red chillies, curry leaves and sesame.",
    "routing": "KITCHEN_LINE"
  },
  {
    "id": "menu-item-mut-001",
    "itemCode": "MENU-MUT-001",
    "itemName": "Mutton Mamna Skewers",
    "category": "FROM THE SHORE - MUTTON",
    "dietaryType": "NON_VEG",
    "sellingPrice": 480,
    "description": "Minced mutton skewers seasoned with garlic, turmeric and fresh green chillies, butter-glazed over charcoal.",
    "routing": "KITCHEN_LINE"
  },
  {
    "id": "menu-item-mut-002",
    "itemCode": "MENU-MUT-002",
    "itemName": "Mutton Ghee Roast (Tawa Starter)",
    "category": "FROM THE SHORE - MUTTON",
    "dietaryType": "NON_VEG",
    "sellingPrice": 560,
    "description": "Tender mutton slow-cooked and pan-seared dry with Byadgi chillies, ghee and Mangalorean masala (SF0004).",
    "routing": "KITCHEN_LINE"
  },
  {
    "id": "menu-item-mut-003",
    "itemCode": "MENU-MUT-003",
    "itemName": "Malabari Pepper Mutton",
    "category": "FROM THE SHORE - MUTTON",
    "dietaryType": "NON_VEG",
    "sellingPrice": 520,
    "description": "Tender mutton pan-fried with freshly crushed Tellicherry peppercorns, cumin and fennel.",
    "routing": "KITCHEN_LINE"
  },
  {
    "id": "menu-item-mut-004",
    "itemCode": "MENU-MUT-004",
    "itemName": "Green Herb Mutton",
    "category": "FROM THE SHORE - MUTTON",
    "dietaryType": "NON_VEG",
    "sellingPrice": 540,
    "description": "Tender mutton marinated with fresh coriander, mint, green chillies and Cafreal spices, chargrilled.",
    "routing": "KITCHEN_LINE"
  },
  {
    "id": "menu-item-cur-001",
    "itemCode": "MENU-CUR-001",
    "itemName": "Goan Vegetable Curry",
    "category": "CURRIES & DAALS",
    "dietaryType": "VEG",
    "sellingPrice": 340,
    "description": "Seasonal vegetables simmered in a classic Goan Xacuti curry of roasted coconut and toasted spices.",
    "routing": "CURRY_STATION"
  },
  {
    "id": "menu-item-cur-002",
    "itemCode": "MENU-CUR-002",
    "itemName": "Malvani Jackfruit Rassa",
    "category": "CURRIES & DAALS",
    "dietaryType": "VEG",
    "sellingPrice": 360,
    "description": "Tender raw jackfruit simmered in a traditional Malvani rassa with roasted coconut and citrusy triphal.",
    "routing": "CURRY_STATION"
  },
  {
    "id": "menu-item-cur-003",
    "itemCode": "MENU-CUR-003",
    "itemName": "Smoked Paneer in Green Gravy",
    "category": "CURRIES & DAALS",
    "dietaryType": "VEG",
    "sellingPrice": 390,
    "description": "Chargrilled paneer cubes simmered in a vibrant gravy of spinach, fresh mint, coriander and green chillies.",
    "routing": "CURRY_STATION"
  },
  {
    "id": "menu-item-cur-004",
    "itemCode": "MENU-CUR-004",
    "itemName": "Stuffed Brinjal Curry",
    "category": "CURRIES & DAALS",
    "dietaryType": "VEG",
    "sellingPrice": 320,
    "description": "Small brinjals stuffed with spiced coconut-peanut blend and simmered in roasted coconut gravy (Bharleli Vangi).",
    "routing": "CURRY_STATION"
  },
  {
    "id": "menu-item-cur-005",
    "itemCode": "MENU-CUR-005",
    "itemName": "Konkan Leaf Curry",
    "category": "CURRIES & DAALS",
    "dietaryType": "VEG",
    "sellingPrice": 320,
    "description": "Colocasia leaves and stems slow-cooked with tamarind, jaggery and roasted spices (Alu che Fadfade).",
    "routing": "CURRY_STATION"
  },
  {
    "id": "menu-item-cur-006",
    "itemCode": "MENU-CUR-006",
    "itemName": "Smoked Paneer in Red Gravy",
    "category": "CURRIES & DAALS",
    "dietaryType": "VEG",
    "sellingPrice": 390,
    "description": "Chargrilled paneer simmered in a rich onion-tomato gravy with Damao spices and gentle smoke finish.",
    "routing": "CURRY_STATION"
  },
  {
    "id": "menu-item-cur-007",
    "itemCode": "MENU-CUR-007",
    "itemName": "Mangalorean Vegetable Korma",
    "category": "CURRIES & DAALS",
    "dietaryType": "VEG",
    "sellingPrice": 340,
    "description": "Seasonal vegetables simmered in a creamy coconut gravy with Byadgi chillies, fennel and aromatic herbs.",
    "routing": "CURRY_STATION"
  },
  {
    "id": "menu-item-cur-008",
    "itemCode": "MENU-CUR-008",
    "itemName": "Jackfruit Green Curry",
    "category": "CURRIES & DAALS",
    "dietaryType": "VEG",
    "sellingPrice": 360,
    "description": "Tender raw jackfruit slow-cooked in a Goan Cafreal herb and coconut milk base.",
    "routing": "CURRY_STATION"
  },
  {
    "id": "menu-item-cur-009",
    "itemCode": "MENU-CUR-009",
    "itemName": "Yellow Dal Tadka",
    "category": "CURRIES & DAALS",
    "dietaryType": "VEG",
    "sellingPrice": 240,
    "description": "Slow-cooked yellow lentils finished with a fragrant tempering of cumin, garlic, dried red chillies and ghee.",
    "routing": "CURRY_STATION"
  },
  {
    "id": "menu-item-cur-010",
    "itemCode": "MENU-CUR-010",
    "itemName": "Yellow Dal Fry",
    "category": "CURRIES & DAALS",
    "dietaryType": "VEG",
    "sellingPrice": 260,
    "description": "Yellow lentils sauteed with onions, tomatoes, green chillies and finished with sizzling garlic tadka.",
    "routing": "CURRY_STATION"
  },
  {
    "id": "menu-item-cur-011",
    "itemCode": "MENU-CUR-011",
    "itemName": "Yellow Dal Varan",
    "category": "CURRIES & DAALS",
    "dietaryType": "VEG",
    "sellingPrice": 220,
    "description": "Homestyle Tur dal delicately seasoned with turmeric, rock salt and pure desi cow ghee.",
    "routing": "CURRY_STATION"
  },
  {
    "id": "menu-item-cur-012",
    "itemCode": "MENU-CUR-012",
    "itemName": "Sprouted Moong Gassi",
    "category": "CURRIES & DAALS",
    "dietaryType": "VEG",
    "sellingPrice": 280,
    "description": "Sprouted green gram simmered in a coconut gravy with roasted coriander, tamarind and curry leaves.",
    "routing": "CURRY_STATION"
  },
  {
    "id": "menu-item-mck-001",
    "itemCode": "MENU-MCK-001",
    "itemName": "Damao Homestyle Curry",
    "category": "MEAT CURRIES - CHICKEN",
    "dietaryType": "NON_VEG",
    "sellingPrice": 480,
    "description": "Tender chicken simmered in rich onion and tomato gravy with signature Damao Masala.",
    "routing": "CURRY_STATION"
  },
  {
    "id": "menu-item-mck-002",
    "itemCode": "MENU-MCK-002",
    "itemName": "Smoked Damao Tikka Masala",
    "category": "MEAT CURRIES - CHICKEN",
    "dietaryType": "NON_VEG",
    "sellingPrice": 530,
    "description": "Chargrilled chicken tikka pieces simmered in rich Damao onion-tomato gravy with a gentle smoky glaze.",
    "routing": "CURRY_STATION"
  },
  {
    "id": "menu-item-mck-003",
    "itemCode": "MENU-MCK-003",
    "itemName": "Classic Xacuti Masala",
    "category": "MEAT CURRIES - CHICKEN",
    "dietaryType": "NON_VEG",
    "sellingPrice": 510,
    "description": "Tender chicken simmered in Goan Xacuti curry of slow-roasted grated coconut and toasted spices.",
    "routing": "CURRY_STATION"
  },
  {
    "id": "menu-item-mck-004",
    "itemCode": "MENU-MCK-004",
    "itemName": "Red Vindaloo Curry",
    "category": "MEAT CURRIES - CHICKEN",
    "dietaryType": "NON_VEG",
    "sellingPrice": 520,
    "description": "Chicken slow-cooked in a vibrant Goan curry of toddy vinegar, garlic and Red Pepper Dip (SF0008).",
    "routing": "CURRY_STATION",
    "recipeId": "rcp-gdwg7zo"
  },
  {
    "id": "menu-item-mck-005",
    "itemCode": "MENU-MCK-005",
    "itemName": "Green Herb Masala",
    "category": "MEAT CURRIES - CHICKEN",
    "dietaryType": "NON_VEG",
    "sellingPrice": 490,
    "description": "Chicken pieces simmered in fresh mint, coriander and green chilli Cafreal gravy.",
    "routing": "CURRY_STATION"
  },
  {
    "id": "menu-item-mmt-001",
    "itemCode": "MENU-MMT-001",
    "itemName": "Mutton Xacuti",
    "category": "MEAT CURRIES - MUTTON",
    "dietaryType": "NON_VEG",
    "sellingPrice": 620,
    "description": "Tender mutton slow-cooked in a complex Goan Xacuti gravy of roasted coconut, poppy seeds and spices.",
    "routing": "CURRY_STATION"
  },
  {
    "id": "menu-item-mmt-002",
    "itemCode": "MENU-MMT-002",
    "itemName": "Mutton Malvani Rassa",
    "category": "MEAT CURRIES - MUTTON",
    "dietaryType": "NON_VEG",
    "sellingPrice": 580,
    "description": "Slow-cooked mutton in an authentic Malvani broth with roasted coconut paste and citrusy triphal.",
    "routing": "CURRY_STATION"
  },
  {
    "id": "menu-item-mmt-003",
    "itemCode": "MENU-MMT-003",
    "itemName": "Mutton Ghee Roast Curry",
    "category": "MEAT CURRIES - MUTTON",
    "dietaryType": "NON_VEG",
    "sellingPrice": 640,
    "description": "Tender mutton simmered in a rich, velvety Mangalorean ghee roast gravy (SF0004) with Byadgi chillies.",
    "routing": "CURRY_STATION"
  },
  {
    "id": "menu-item-ric-001",
    "itemCode": "MENU-RIC-001",
    "itemName": "Steamed Rice",
    "category": "RICE",
    "dietaryType": "VEG",
    "sellingPrice": 160,
    "description": "Fragrant steamed Kolam rice, an essential accompaniment to coastal curries.",
    "routing": "KITCHEN_LINE"
  },
  {
    "id": "menu-item-ric-002",
    "itemCode": "MENU-RIC-002",
    "itemName": "Sticky Indrayani Rice",
    "category": "RICE",
    "dietaryType": "VEG",
    "sellingPrice": 180,
    "description": "Naturally sticky and fragrant Indrayani rice from the Western Ghats, served with pure ghee.",
    "routing": "KITCHEN_LINE"
  },
  {
    "id": "menu-item-ric-003",
    "itemCode": "MENU-RIC-003",
    "itemName": "Jeera Rice",
    "category": "RICE",
    "dietaryType": "VEG",
    "sellingPrice": 210,
    "description": "Aromatic long-grain basmati rice delicately tempered with cumin seeds and pure desi ghee.",
    "routing": "KITCHEN_LINE"
  },
  {
    "id": "menu-item-ric-004",
    "itemCode": "MENU-RIC-004",
    "itemName": "Vegetable Pulav",
    "category": "RICE",
    "dietaryType": "VEG",
    "sellingPrice": 280,
    "description": "Basmati rice cooked with garden-fresh vegetables, cinnamon, cloves and saffron-scented herbs.",
    "routing": "KITCHEN_LINE"
  },
  {
    "id": "menu-item-ric-005",
    "itemCode": "MENU-RIC-005",
    "itemName": "Jackfruit Biryani",
    "category": "RICE",
    "dietaryType": "VEG",
    "sellingPrice": 380,
    "description": "Tender young jackfruit and basmati rice slow dum-cooked with fried onions, mint and coastal biryani masala.",
    "routing": "KITCHEN_LINE"
  },
  {
    "id": "menu-item-ric-006",
    "itemCode": "MENU-RIC-006",
    "itemName": "Classic Chicken Biryani",
    "category": "RICE",
    "dietaryType": "NON_VEG",
    "sellingPrice": 460,
    "description": "Slow sealed dum-cooked biryani with marinated chicken, saffron milk, mint and caramelised onions.",
    "routing": "KITCHEN_LINE"
  },
  {
    "id": "menu-item-ric-007",
    "itemCode": "MENU-RIC-007",
    "itemName": "Classic Mutton Biryani",
    "category": "RICE",
    "dietaryType": "NON_VEG",
    "sellingPrice": 520,
    "description": "Fragrant basmati rice layered with succulent bone-in mutton, Malabar whole spices and pure ghee in dum.",
    "routing": "KITCHEN_LINE"
  },
  {
    "id": "menu-item-ric-008",
    "itemCode": "MENU-RIC-008",
    "itemName": "Stewed Mutton Rice",
    "category": "RICE",
    "dietaryType": "NON_VEG",
    "sellingPrice": 480,
    "description": "Comforting one-pot coastal preparation of rice slow-simmered in rich mutton bone broth and spices.",
    "routing": "KITCHEN_LINE"
  },
  {
    "id": "menu-item-brd-001",
    "itemCode": "MENU-BRD-001",
    "itemName": "Rice Bhakri",
    "category": "COASTAL BREADS",
    "dietaryType": "VEG",
    "sellingPrice": 60,
    "description": "Hand-rolled rustic rice flour flatbread (Tandalachi Bhakari) toasted on iron tawa.",
    "routing": "KITCHEN_LINE"
  },
  {
    "id": "menu-item-brd-002",
    "itemCode": "MENU-BRD-002",
    "itemName": "Amboli",
    "category": "COASTAL BREADS",
    "dietaryType": "VEG",
    "sellingPrice": 90,
    "description": "Soft, spongy fermented rice and black gram pancake, staple across Konkan coast.",
    "routing": "KITCHEN_LINE"
  },
  {
    "id": "menu-item-brd-003",
    "itemCode": "MENU-BRD-003",
    "itemName": "Chapati",
    "category": "COASTAL BREADS",
    "dietaryType": "VEG",
    "sellingPrice": 40,
    "description": "Soft whole wheat flatbread freshly prepared on the tawa.",
    "routing": "KITCHEN_LINE"
  },
  {
    "id": "menu-item-brd-004",
    "itemCode": "MENU-BRD-004",
    "itemName": "Poi",
    "category": "COASTAL BREADS",
    "dietaryType": "VEG",
    "sellingPrice": 110,
    "description": "Traditional Goan wood-fired hollow whole-wheat bread, perfect for dipping into curries.",
    "routing": "KITCHEN_LINE"
  }
];
