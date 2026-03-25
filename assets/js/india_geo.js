/**
 * india_geo.js — All 36 States/UTs + Districts + Major Cities
 * Used by index.html search & client.html location picker
 */
const INDIA_GEO = [
    {
        state: "Andhra Pradesh", code: "AP", lat: 15.9129, lon: 79.7400, districts: [
            { d: "Visakhapatnam", lat: 17.6868, lon: 83.2185, cities: ["Visakhapatnam", "Bheemunipatnam", "Anakapalle"] },
            { d: "East Godavari", lat: 17.0005, lon: 81.8040, cities: ["Kakinada", "Rajahmundry", "Amalapuram"] },
            { d: "West Godavari", lat: 16.9174, lon: 81.3368, cities: ["Eluru", "Bhimavaram", "Tadepalligudem"] },
            { d: "Krishna", lat: 16.6094, lon: 80.7214, cities: ["Vijayawada", "Machilipatnam", "Gudivada"] },
            { d: "Guntur", lat: 16.3067, lon: 80.4365, cities: ["Guntur", "Tenali", "Narasaraopet"] },
            { d: "Prakasam", lat: 15.3424, lon: 79.5718, cities: ["Ongole", "Markapur", "Chirala"] },
            { d: "Nellore", lat: 14.4426, lon: 79.9865, cities: ["Nellore", "Kavali", "Gudur"] },
            { d: "Kurnool", lat: 15.8281, lon: 78.0373, cities: ["Kurnool", "Adoni", "Nandyal"] },
            { d: "Kadapa", lat: 14.4673, lon: 78.8242, cities: ["Kadapa", "Proddatur", "Rajampet"] },
            { d: "Anantapur", lat: 14.6819, lon: 77.6006, cities: ["Anantapur", "Dharmavaram", "Guntakal"] },
            { d: "Chittoor", lat: 13.2172, lon: 79.1003, cities: ["Chittoor", "Tirupati", "Madanapalle"] },
            { d: "Srikakulam", lat: 18.2949, lon: 83.8938, cities: ["Srikakulam", "Narasannapeta", "Palasa"] },
            { d: "Vizianagaram", lat: 18.1124, lon: 83.3956, cities: ["Vizianagaram", "Bobbili", "Parvathipuram"] },
        ]
    },
    {
        state: "Arunachal Pradesh", code: "AR", lat: 28.2180, lon: 94.7278, districts: [
            { d: "Itanagar", lat: 27.0844, lon: 93.6053, cities: ["Itanagar", "Naharlagun"] },
            { d: "East Siang", lat: 28.2180, lon: 95.3000, cities: ["Pasighat"] },
            { d: "Tawang", lat: 27.5859, lon: 91.8678, cities: ["Tawang"] },
        ]
    },
    {
        state: "Assam", code: "AS", lat: 26.2006, lon: 92.9376, districts: [
            { d: "Kamrup Metro", lat: 26.1445, lon: 91.7362, cities: ["Guwahati", "Dispur"] },
            { d: "Dibrugarh", lat: 27.4728, lon: 94.9121, cities: ["Dibrugarh", "Naharkatia"] },
            { d: "Jorhat", lat: 26.7509, lon: 94.2037, cities: ["Jorhat", "Mariani"] },
            { d: "Silchar", lat: 24.8333, lon: 92.7789, cities: ["Silchar", "Sonai"] },
            { d: "Tezpur", lat: 26.6338, lon: 92.8004, cities: ["Tezpur", "Rangapara"] },
            { d: "Nagaon", lat: 26.3471, lon: 92.6836, cities: ["Nagaon", "Hojai"] },
            { d: "Barpeta", lat: 26.3200, lon: 91.0050, cities: ["Barpeta", "Howly"] },
            { d: "Dhubri", lat: 26.0200, lon: 89.9800, cities: ["Dhubri", "Bilasipara"] },
        ]
    },
    {
        state: "Bihar", code: "BR", lat: 25.0961, lon: 85.3131, districts: [
            { d: "Patna", lat: 25.5941, lon: 85.1376, cities: ["Patna", "Danapur", "Hajipur"] },
            { d: "Gaya", lat: 24.7914, lon: 85.0002, cities: ["Gaya", "Bodhgaya", "Aurangabad"] },
            { d: "Muzaffarpur", lat: 26.1197, lon: 85.3910, cities: ["Muzaffarpur", "Sitamarhi"] },
            { d: "Bhagalpur", lat: 25.2425, lon: 86.9842, cities: ["Bhagalpur", "Banka"] },
            { d: "Darbhanga", lat: 26.1542, lon: 85.8918, cities: ["Darbhanga", "Laheriasarai"] },
            { d: "Purnea", lat: 25.7771, lon: 87.4753, cities: ["Purnia", "Kishanganj", "Katihar"] },
            { d: "Begusarai", lat: 25.4182, lon: 86.1272, cities: ["Begusarai", "Barauni"] },
            { d: "Nalanda", lat: 25.0000, lon: 85.5000, cities: ["Bihar Sharif", "Rajgir", "Biharsharif"] },
            { d: "Saran", lat: 25.9164, lon: 84.7493, cities: ["Chapra", "Marhowrah"] },
            { d: "Samastipur", lat: 25.8783, lon: 85.7786, cities: ["Samastipur", "Rosera"] },
        ]
    },
    {
        state: "Chhattisgarh", code: "CG", lat: 21.2787, lon: 81.8661, districts: [
            { d: "Raipur", lat: 21.2514, lon: 81.6296, cities: ["Raipur", "Birgaon", "Arang"] },
            { d: "Bilaspur", lat: 22.0796, lon: 82.1391, cities: ["Bilaspur", "Ratanpur"] },
            { d: "Durg", lat: 21.1905, lon: 81.2849, cities: ["Durg", "Bhilai", "Rajnandgaon"] },
            { d: "Korba", lat: 22.3595, lon: 82.7501, cities: ["Korba", "Katghora"] },
            { d: "Raigarh", lat: 21.8974, lon: 83.3950, cities: ["Raigarh", "Sarangarh"] },
            { d: "Jagdalpur", lat: 19.0747, lon: 82.0337, cities: ["Jagdalpur", "Kondagaon"] },
            { d: "Ambikapur", lat: 23.1150, lon: 83.1948, cities: ["Ambikapur", "Surajpur"] },
        ]
    },
    {
        state: "Goa", code: "GA", lat: 15.2993, lon: 74.1240, districts: [
            { d: "North Goa", lat: 15.4909, lon: 73.8278, cities: ["Panaji", "Mapusa", "Calangute", "Pernem"] },
            { d: "South Goa", lat: 15.1432, lon: 74.0568, cities: ["Margao", "Vasco da Gama", "Ponda"] },
        ]
    },
    {
        state: "Gujarat", code: "GJ", lat: 22.2587, lon: 71.1924, districts: [
            { d: "Ahmedabad", lat: 23.0225, lon: 72.5714, cities: ["Ahmedabad", "Gandhinagar", "Sanand"] },
            { d: "Surat", lat: 21.1702, lon: 72.8311, cities: ["Surat", "Navsari", "Bardoli"] },
            { d: "Vadodara", lat: 22.3072, lon: 73.1812, cities: ["Vadodara", "Anand", "Karjan"] },
            { d: "Rajkot", lat: 22.3039, lon: 70.8022, cities: ["Rajkot", "Gondal", "Jetpur"] },
            { d: "Bhavnagar", lat: 21.7645, lon: 72.1519, cities: ["Bhavnagar", "Palitana", "Mahuva"] },
            { d: "Jamnagar", lat: 22.4707, lon: 70.0577, cities: ["Jamnagar", "Kalavad", "Khambhalia"] },
            { d: "Junagadh", lat: 21.5222, lon: 70.4579, cities: ["Junagadh", "Veraval", "Keshod"] },
            { d: "Amreli", lat: 21.6032, lon: 71.2213, cities: ["Amreli", "Savarkundla", "Rajula"] },
            { d: "Mehsana", lat: 23.5880, lon: 72.3693, cities: ["Mehsana", "Vadnagar", "Visnagar"] },
            { d: "Gandhinagar", lat: 23.2156, lon: 72.6369, cities: ["Gandhinagar", "Mansa", "Dehgam"] },
            { d: "Kutch", lat: 23.7337, lon: 69.8597, cities: ["Bhuj", "Anjar", "Gandhidham", "Mundra"] },
            { d: "Patan", lat: 23.8493, lon: 72.1266, cities: ["Patan", "Sidhpur", "Chanasma"] },
            { d: "Banaskantha", lat: 24.1754, lon: 72.4367, cities: ["Palanpur", "Deesa", "Dhanera"] },
        ]
    },
    {
        state: "Haryana", code: "HR", lat: 29.0588, lon: 76.0856, districts: [
            { d: "Gurugram", lat: 28.4595, lon: 77.0266, cities: ["Gurugram", "Farrukhnagar", "Pataudi"] },
            { d: "Faridabad", lat: 28.4089, lon: 77.3178, cities: ["Faridabad", "Ballabhgarh", "Palwal"] },
            { d: "Ambala", lat: 30.3752, lon: 76.7821, cities: ["Ambala", "Naraingarh", "Barara"] },
            { d: "Hisar", lat: 29.1492, lon: 75.7217, cities: ["Hisar", "Hansi", "Narwana"] },
            { d: "Rohtak", lat: 28.8955, lon: 76.6066, cities: ["Rohtak", "Bahadurgarh", "Jhajjar"] },
            { d: "Karnal", lat: 29.6857, lon: 76.9905, cities: ["Karnal", "Panipat", "Assandh"] },
            { d: "Sonipat", lat: 28.9288, lon: 77.0200, cities: ["Sonipat", "Gohana", "Kharkhoda"] },
            { d: "Kurukshetra", lat: 29.9695, lon: 76.8783, cities: ["Kurukshetra", "Shahabad", "Pehowa"] },
            { d: "Sirsa", lat: 29.5337, lon: 75.0201, cities: ["Sirsa", "Dabwali", "Ellenabad"] },
            { d: "Bhiwani", lat: 28.7975, lon: 76.1322, cities: ["Bhiwani", "Loharu", "Charkhi Dadri"] },
        ]
    },
    {
        state: "Himachal Pradesh", code: "HP", lat: 31.1048, lon: 77.1734, districts: [
            { d: "Shimla", lat: 31.1048, lon: 77.1734, cities: ["Shimla", "Rampur", "Rohru"] },
            { d: "Kangra", lat: 32.0998, lon: 76.2691, cities: ["Dharamshala", "Palampur", "Nurpur"] },
            { d: "Mandi", lat: 31.7083, lon: 76.9319, cities: ["Mandi", "Sundarnagar", "Jogindernagar"] },
            { d: "Kullu", lat: 31.9579, lon: 77.1095, cities: ["Kullu", "Manali", "Banjar"] },
            { d: "Solan", lat: 30.9045, lon: 77.0967, cities: ["Solan", "Baddi", "Nalagarh"] },
            { d: "Una", lat: 31.4685, lon: 76.2708, cities: ["Una", "Amb", "Bangana"] },
        ]
    },
    {
        state: "Jharkhand", code: "JH", lat: 23.6102, lon: 85.2799, districts: [
            { d: "Ranchi", lat: 23.3441, lon: 85.3096, cities: ["Ranchi", "Kanke", "Tatisilwe"] },
            { d: "Dhanbad", lat: 23.7957, lon: 86.4304, cities: ["Dhanbad", "Jharia", "Sindri"] },
            { d: "Jamshedpur", lat: 22.8046, lon: 86.2029, cities: ["Jamshedpur", "Jugsalai", "Mango"] },
            { d: "Bokaro", lat: 23.6693, lon: 86.1511, cities: ["Bokaro", "Chas", "Gomia"] },
            { d: "Hazaribagh", lat: 23.9925, lon: 85.3564, cities: ["Hazaribagh", "Ramgarh", "Barhi"] },
            { d: "Deoghar", lat: 24.4853, lon: 86.6953, cities: ["Deoghar", "Jasidih", "Mohanpur"] },
            { d: "Dumka", lat: 24.2671, lon: 87.2460, cities: ["Dumka", "Shikaripara", "Jama"] },
            { d: "Giridih", lat: 24.1853, lon: 86.3022, cities: ["Giridih", "Bagodar", "Gandey"] },
        ]
    },
    {
        state: "Karnataka", code: "KA", lat: 15.3173, lon: 75.7139, districts: [
            { d: "Bengaluru Urban", lat: 12.9716, lon: 77.5946, cities: ["Bengaluru", "Yelahanka", "Whitefield"] },
            { d: "Mysuru", lat: 12.2958, lon: 76.6394, cities: ["Mysuru", "Nanjangud", "T Narasipura"] },
            { d: "Hubballi-Dharwad", lat: 15.3647, lon: 75.1240, cities: ["Hubballi", "Dharwad", "Kalagatgi"] },
            { d: "Mangaluru", lat: 12.8698, lon: 74.8431, cities: ["Mangaluru", "Bantwal", "Puttur"] },
            { d: "Belagavi", lat: 15.8497, lon: 74.4977, cities: ["Belagavi", "Gokak", "Bailhongal"] },
            { d: "Ballari", lat: 15.1394, lon: 76.9214, cities: ["Ballari", "Hospet", "Siruguppa"] },
            { d: "Kalaburagi", lat: 17.3297, lon: 76.8343, cities: ["Kalaburagi", "Afzalpur", "Sedam"] },
            { d: "Tumakuru", lat: 13.3379, lon: 77.1173, cities: ["Tumakuru", "Tiptur", "Madhugiri"] },
            { d: "Shivamogga", lat: 13.9299, lon: 75.5681, cities: ["Shivamogga", "Sagara", "Bhadravati"] },
            { d: "Raichur", lat: 16.2120, lon: 77.3439, cities: ["Raichur", "Sindhanur", "Devadurga"] },
            { d: "Vijayapura", lat: 16.8302, lon: 75.7100, cities: ["Vijayapura", "Muddebihal", "Indi"] },
            { d: "Hassan", lat: 13.0068, lon: 76.1004, cities: ["Hassan", "Arakalagudu", "Alur"] },
            { d: "Chikkamagaluru", lat: 13.3153, lon: 75.7754, cities: ["Chikkamagaluru", "Kadur", "Tarikere"] },
            { d: "Udupi", lat: 13.3409, lon: 74.7421, cities: ["Udupi", "Kundapur", "Karkala"] },
        ]
    },
    {
        state: "Kerala", code: "KL", lat: 10.8505, lon: 76.2711, districts: [
            { d: "Thiruvananthapuram", lat: 8.5241, lon: 76.9366, cities: ["Thiruvananthapuram", "Neyyattinkara", "Nedumangad"] },
            { d: "Ernakulam", lat: 9.9312, lon: 76.2673, cities: ["Kochi", "Thrippunithura", "Aluva", "Perumbavoor"] },
            { d: "Kozhikode", lat: 11.2588, lon: 75.7804, cities: ["Kozhikode", "Vadakara", "Koyilandy"] },
            { d: "Thrissur", lat: 10.5276, lon: 76.2144, cities: ["Thrissur", "Irinjalakuda", "Chalakudy"] },
            { d: "Palakkad", lat: 10.7867, lon: 76.6548, cities: ["Palakkad", "Ottappalam", "Shoranur"] },
            { d: "Malappuram", lat: 11.0732, lon: 76.0710, cities: ["Malappuram", "Tirur", "Ponnani"] },
            { d: "Kannur", lat: 11.8745, lon: 75.3704, cities: ["Kannur", "Thalassery", "Payyanur"] },
            { d: "Kollam", lat: 8.8932, lon: 76.6141, cities: ["Kollam", "Karunagappally", "Chavara"] },
            { d: "Alappuzha", lat: 9.4981, lon: 76.3388, cities: ["Alappuzha", "Cherthala", "Kayamkulam"] },
            { d: "Kottayam", lat: 9.5916, lon: 76.5222, cities: ["Kottayam", "Changanassery", "Pala"] },
            { d: "Idukki", lat: 9.9189, lon: 77.1025, cities: ["Thodupuzha", "Munnar", "Adimali"] },
            { d: "Kasaragod", lat: 12.4996, lon: 74.9869, cities: ["Kasaragod", "Kanhangad", "Nileshwar"] },
            { d: "Wayanad", lat: 11.6854, lon: 76.1320, cities: ["Kalpetta", "Mananthavady", "Sulthan Bathery"] },
            { d: "Pathanamthitta", lat: 9.2648, lon: 76.7870, cities: ["Pathanamthitta", "Adoor", "Tiruvalla"] },
        ]
    },
    {
        state: "Madhya Pradesh", code: "MP", lat: 22.9734, lon: 78.6569, districts: [
            { d: "Bhopal", lat: 23.2599, lon: 77.4126, cities: ["Bhopal", "Mandideep", "Berasia"] },
            { d: "Indore", lat: 22.7196, lon: 75.8577, cities: ["Indore", "Mhow", "Sanwer", "Depalpur"] },
            { d: "Jabalpur", lat: 23.1815, lon: 79.9864, cities: ["Jabalpur", "Katni", "Sihora"] },
            { d: "Gwalior", lat: 26.2183, lon: 78.1828, cities: ["Gwalior", "Morena", "Bhind", "Dabra"] },
            { d: "Ujjain", lat: 23.1765, lon: 75.7885, cities: ["Ujjain", "Nagda", "Mahidpur"] },
            { d: "Sagar", lat: 23.8388, lon: 78.7378, cities: ["Sagar", "Banda", "Rehli", "Khurai"] },
            { d: "Rewa", lat: 24.5362, lon: 81.2996, cities: ["Rewa", "Satna", "Sidhi"] },
            { d: "Chhindwara", lat: 22.0574, lon: 78.9382, cities: ["Chhindwara", "Parasia", "Sausar"] },
            { d: "Dewas", lat: 22.9676, lon: 76.0534, cities: ["Dewas", "Khategaon", "Sonkatch"] },
            { d: "Ratlam", lat: 23.3339, lon: 75.0367, cities: ["Ratlam", "Jaora", "Mandsour"] },
            { d: "Bhind", lat: 26.5603, lon: 78.7878, cities: ["Bhind", "Lahar", "Mehgaon"] },
            { d: "Vidisha", lat: 23.5251, lon: 77.8082, cities: ["Vidisha", "Ganjbasoda", "Gyaraspur"] },
            { d: "Shahdol", lat: 23.2965, lon: 81.3531, cities: ["Shahdol", "Anuppur", "Pushparajgarh"] },
            { d: "Hoshangabad", lat: 22.7500, lon: 77.7200, cities: ["Hoshangabad", "Itarsi", "Pipariya"] },
        ]
    },
    {
        state: "Maharashtra", code: "MH", lat: 19.7515, lon: 75.7139, districts: [
            { d: "Mumbai City", lat: 18.9388, lon: 72.8354, cities: ["Mumbai", "Colaba", "Bandra", "Andheri"] },
            { d: "Mumbai Suburban", lat: 19.1748, lon: 72.9757, cities: ["Thane", "Borivali", "Malad", "Kandivali"] },
            { d: "Pune", lat: 18.5204, lon: 73.8567, cities: ["Pune", "Pimpri-Chinchwad", "Baramati", "Bhor"] },
            { d: "Nagpur", lat: 21.1458, lon: 79.0882, cities: ["Nagpur", "Kamptee", "Ramtek", "Hingna"] },
            { d: "Nashik", lat: 19.9975, lon: 73.7898, cities: ["Nashik", "Malegaon", "Manmad", "Igatpuri"] },
            { d: "Chhattrapati Sambhajinagar", lat: 19.8762, lon: 75.3433, cities: ["Aurangabad", "Jalna", "Kannad"] },
            { d: "Solapur", lat: 17.6805, lon: 75.9064, cities: ["Solapur", "Pandharpur", "Barshi", "Akkalkot"] },
            { d: "Kolhapur", lat: 16.7050, lon: 74.2433, cities: ["Kolhapur", "Ichalkaranji", "Sangli", "Miraj"] },
            { d: "Nanded", lat: 19.1383, lon: 77.3210, cities: ["Nanded", "Biloli", "Kinwat", "Hadgaon"] },
            { d: "Amravati", lat: 20.9320, lon: 77.7523, cities: ["Amravati", "Achalpur", "Daryapur"] },
            { d: "Akola", lat: 20.7002, lon: 77.0082, cities: ["Akola", "Akot", "Murtijapur", "Washim"] },
            { d: "Yavatmal", lat: 20.3888, lon: 78.1204, cities: ["Yavatmal", "Pusad", "Wani", "Pandharkawada"] },
            { d: "Latur", lat: 18.4088, lon: 76.5604, cities: ["Latur", "Udgir", "Ausa", "Nilanga"] },
            { d: "Jalgaon", lat: 21.0077, lon: 75.5626, cities: ["Jalgaon", "Bhusawal", "Pachora", "Amalner"] },
            { d: "Dhule", lat: 20.9042, lon: 74.7749, cities: ["Dhule", "Shirpur", "Sindkheda"] },
            { d: "Ahmednagar", lat: 19.0952, lon: 74.7480, cities: ["Ahmednagar", "Rahuri", "Shrirampur", "Kopargaon"] },
            { d: "Raigad", lat: 18.5178, lon: 73.1742, cities: ["Alibag", "Panvel", "Uran", "Pen"] },
            { d: "Ratnagiri", lat: 16.9902, lon: 73.3120, cities: ["Ratnagiri", "Chiplun", "Khed"] },
            { d: "Sindhudurg", lat: 16.3507, lon: 73.7188, cities: ["Kudal", "Sawantwadi", "Malvan"] },
            { d: "Satara", lat: 17.6861, lon: 74.0028, cities: ["Satara", "Karad", "Wai", "Panchgani"] },
        ]
    },
    {
        state: "Manipur", code: "MN", lat: 24.6637, lon: 93.9063, districts: [
            { d: "Imphal West", lat: 24.6637, lon: 93.9063, cities: ["Imphal", "Lamphel", "Lamsang"] },
            { d: "Imphal East", lat: 24.8074, lon: 93.9384, cities: ["Porompat", "Leimakhong"] },
            { d: "Thoubal", lat: 24.6362, lon: 94.0095, cities: ["Thoubal", "Wangjing", "Kakching"] },
            { d: "Bishnupur", lat: 24.6250, lon: 93.7738, cities: ["Bishnupur", "Nambol", "Moirang"] },
        ]
    },
    {
        state: "Meghalaya", code: "ML", lat: 25.4670, lon: 91.3662, districts: [
            { d: "East Khasi Hills", lat: 25.5788, lon: 91.8933, cities: ["Shillong", "Cherrapunji", "Mawsynram"] },
            { d: "West Khasi Hills", lat: 25.6117, lon: 91.0219, cities: ["Nongstoin"] },
            { d: "Garo Hills", lat: 25.5137, lon: 90.2143, cities: ["Tura", "Resubelpara"] },
            { d: "Jaintia Hills", lat: 25.3891, lon: 92.4770, cities: ["Jowai", "Nongpoh"] },
        ]
    },
    {
        state: "Mizoram", code: "MZ", lat: 23.1645, lon: 92.9376, districts: [
            { d: "Aizawl", lat: 23.7271, lon: 92.7176, cities: ["Aizawl", "Khawzawl"] },
            { d: "Lunglei", lat: 22.8880, lon: 92.7347, cities: ["Lunglei", "Hnahthial"] },
            { d: "Champhai", lat: 23.4580, lon: 93.3278, cities: ["Champhai", "Khawbung"] },
        ]
    },
    {
        state: "Nagaland", code: "NL", lat: 26.1584, lon: 94.5624, districts: [
            { d: "Kohima", lat: 25.6751, lon: 94.1086, cities: ["Kohima", "Pfutsero"] },
            { d: "Dimapur", lat: 25.9064, lon: 93.7228, cities: ["Dimapur", "Chumoukedima"] },
            { d: "Mokokchung", lat: 26.3284, lon: 94.5220, cities: ["Mokokchung", "Medziphema"] },
            { d: "Wokha", lat: 26.1016, lon: 94.2650, cities: ["Wokha", "Bhandari"] },
        ]
    },
    {
        state: "Odisha", code: "OD", lat: 20.9517, lon: 85.0985, districts: [
            { d: "Bhubaneswar", lat: 20.2961, lon: 85.8245, cities: ["Bhubaneswar", "Cuttack", "Puri", "Khordha"] },
            { d: "Cuttack", lat: 20.4625, lon: 85.8830, cities: ["Cuttack", "Choudwar", "Jagatpur"] },
            { d: "Berhampur", lat: 19.3149, lon: 84.7941, cities: ["Berhampur", "Chhatrapur", "Bhanjanagar"] },
            { d: "Sambalpur", lat: 21.4669, lon: 83.9756, cities: ["Sambalpur", "Burla", "Jharsuguda"] },
            { d: "Rourkela", lat: 22.2604, lon: 84.8536, cities: ["Rourkela", "Sundargarh", "Bonai"] },
            { d: "Balasore", lat: 21.4942, lon: 86.9340, cities: ["Balasore", "Bhadrak", "Jaleswar"] },
            { d: "Rayagada", lat: 19.1673, lon: 83.4173, cities: ["Rayagada", "Gunupur", "Padmapur"] },
            { d: "Koraput", lat: 18.8121, lon: 82.7109, cities: ["Koraput", "Jeypore", "Semiliguda"] },
            { d: "Angul", lat: 20.8412, lon: 85.1010, cities: ["Angul", "Talcher", "Athamallik"] },
            { d: "Kendrapara", lat: 20.5010, lon: 86.4187, cities: ["Kendrapara", "Pattamundai", "Marshaghai"] },
        ]
    },
    {
        state: "Punjab", code: "PB", lat: 31.1471, lon: 75.3412, districts: [
            { d: "Ludhiana", lat: 30.9010, lon: 75.8573, cities: ["Ludhiana", "Khanna", "Jagraon", "Samrala"] },
            { d: "Amritsar", lat: 31.6340, lon: 74.8723, cities: ["Amritsar", "Attari", "Rayya"] },
            { d: "Jalandhar", lat: 31.3260, lon: 75.5762, cities: ["Jalandhar", "Phagwara", "Nakodar"] },
            { d: "Patiala", lat: 30.3398, lon: 76.3869, cities: ["Patiala", "Rajpura", "Nabha"] },
            { d: "Bathinda", lat: 30.2110, lon: 74.9455, cities: ["Bathinda", "Mansa", "Rampura Phul"] },
            { d: "Mohali", lat: 30.7046, lon: 76.7179, cities: ["Mohali", "Kharar", "Dera Bassi"] },
            { d: "Gurdaspur", lat: 32.0392, lon: 75.4008, cities: ["Gurdaspur", "Batala", "Dera Baba Nanak"] },
            { d: "Hoshiarpur", lat: 31.5343, lon: 75.9118, cities: ["Hoshiarpur", "Mukerian", "Garhshankar"] },
            { d: "Sangrur", lat: 30.2448, lon: 75.8442, cities: ["Sangrur", "Sunam", "Malerkotla"] },
            { d: "Firozpur", lat: 30.9331, lon: 74.6131, cities: ["Firozpur", "Zira", "Jalalabad"] },
        ]
    },
    {
        state: "Rajasthan", code: "RJ", lat: 27.0238, lon: 74.2179, districts: [
            { d: "Jaipur", lat: 26.9124, lon: 75.7873, cities: ["Jaipur", "Amber", "Sanganer", "Phagi"] },
            { d: "Jodhpur", lat: 26.2389, lon: 73.0243, cities: ["Jodhpur", "Pali", "Barmer", "Balotra"] },
            { d: "Kota", lat: 25.2138, lon: 75.8648, cities: ["Kota", "Baran", "Bundi", "Jhalawar"] },
            { d: "Bikaner", lat: 28.0229, lon: 73.3119, cities: ["Bikaner", "Nokha", "Kolayat"] },
            { d: "Ajmer", lat: 26.4499, lon: 74.6399, cities: ["Ajmer", "Pushkar", "Beawar", "Nasirabad"] },
            { d: "Alwar", lat: 27.5530, lon: 76.6346, cities: ["Alwar", "Bhiwadi", "Behror", "Rajgarh"] },
            { d: "Udaipur", lat: 24.5854, lon: 73.7125, cities: ["Udaipur", "Chittorgarh", "Nathdwara"] },
            { d: "Sikar", lat: 27.6115, lon: 75.1397, cities: ["Sikar", "Fatehpur", "Neem Ka Thana"] },
            { d: "Jhunjhunu", lat: 28.1289, lon: 75.4001, cities: ["Jhunjhunu", "Chirawa", "Nawalgarh"] },
            { d: "Nagaur", lat: 27.2029, lon: 73.7301, cities: ["Nagaur", "Merta", "Degana", "Ladnun"] },
            { d: "Sri Ganganagar", lat: 29.9038, lon: 73.8772, cities: ["Sri Ganganagar", "Suratgarh", "Padampur"] },
            { d: "Hanumangarh", lat: 29.5820, lon: 74.3297, cities: ["Hanumangarh", "Sangaria", "Nohar"] },
            { d: "Bharatpur", lat: 27.2152, lon: 77.5030, cities: ["Bharatpur", "Deeg", "Nagar", "Nadbai"] },
            { d: "Dausa", lat: 26.8838, lon: 76.3341, cities: ["Dausa", "Sikandra", "Bandikui"] },
            { d: "Dungarpur", lat: 23.8457, lon: 73.7142, cities: ["Dungarpur", "Sagwara", "Aspur"] },
            { d: "Banswara", lat: 23.5440, lon: 74.4425, cities: ["Banswara", "Bagidora", "Kushalgarh"] },
        ]
    },
    {
        state: "Sikkim", code: "SK", lat: 27.5330, lon: 88.5122, districts: [
            { d: "East Sikkim", lat: 27.3389, lon: 88.6065, cities: ["Gangtok", "Rongli"] },
            { d: "West Sikkim", lat: 27.3333, lon: 88.1500, cities: ["Gyalshing", "Yuksom"] },
            { d: "North Sikkim", lat: 27.9500, lon: 88.5667, cities: ["Mangan", "Chungthang"] },
            { d: "South Sikkim", lat: 27.1575, lon: 88.4767, cities: ["Namchi", "Ravangla"] },
        ]
    },
    {
        state: "Tamil Nadu", code: "TN", lat: 11.1271, lon: 78.6569, districts: [
            { d: "Chennai", lat: 13.0827, lon: 80.2707, cities: ["Chennai", "Tambaram", "Avadi", "Ambattur"] },
            { d: "Coimbatore", lat: 11.0168, lon: 76.9558, cities: ["Coimbatore", "Tiruppur", "Pollachi", "Mettupalayam"] },
            { d: "Madurai", lat: 9.9252, lon: 78.1198, cities: ["Madurai", "Usilampatti", "Melur"] },
            { d: "Tiruchirappalli", lat: 10.7905, lon: 78.7047, cities: ["Tiruchirappalli", "Srirangam", "Musiri"] },
            { d: "Salem", lat: 11.6643, lon: 78.1460, cities: ["Salem", "Mettur", "Omalur", "Attur"] },
            { d: "Tirunelveli", lat: 8.7139, lon: 77.7567, cities: ["Tirunelveli", "Palayamkottai", "Tenkasi"] },
            { d: "Erode", lat: 11.3410, lon: 77.7172, cities: ["Erode", "Bhavani", "Perundurai"] },
            { d: "Vellore", lat: 12.9165, lon: 79.1325, cities: ["Vellore", "Vaniyambadi", "Gudiyatham"] },
            { d: "Thanjavur", lat: 10.7870, lon: 79.1378, cities: ["Thanjavur", "Kumbakonam", "Pattukottai"] },
            { d: "Virudhunagar", lat: 9.5851, lon: 77.9624, cities: ["Virudhunagar", "Sivakasi", "Rajapalayam"] },
            { d: "Kanchipuram", lat: 12.8308, lon: 79.7078, cities: ["Kanchipuram", "Chengalpattu", "Maraimalai Nagar"] },
            { d: "Dindigul", lat: 10.3673, lon: 77.9803, cities: ["Dindigul", "Oddanchatram", "Palani"] },
            { d: "Nagapattinam", lat: 10.7642, lon: 79.8444, cities: ["Nagapattinam", "Kumbakonam"] },
            { d: "Theni", lat: 10.0104, lon: 77.4769, cities: ["Theni", "Bodinayakanur", "Periyakulam"] },
            { d: "Nilgiris", lat: 11.4916, lon: 76.7337, cities: ["Ooty", "Coonoor", "Kotagiri"] },
        ]
    },
    {
        state: "Telangana", code: "TS", lat: 17.8495, lon: 79.1151, districts: [
            { d: "Hyderabad", lat: 17.3850, lon: 78.4867, cities: ["Hyderabad", "Secunderabad", "LB Nagar"] },
            { d: "Rangareddy", lat: 17.3261, lon: 78.5480, cities: ["Malkajgiri", "Shamshabad", "Tandur"] },
            { d: "Medchal", lat: 17.6297, lon: 78.4800, cities: ["Kompally", "Medchal", "Alwal"] },
            { d: "Warangal", lat: 17.9784, lon: 79.5941, cities: ["Warangal", "Hanamkonda", "Kazipet"] },
            { d: "Nizamabad", lat: 18.6725, lon: 78.0941, cities: ["Nizamabad", "Bodhan", "Armoor"] },
            { d: "Karimnagar", lat: 18.4386, lon: 79.1288, cities: ["Karimnagar", "Peddapalli", "Jammikunta"] },
            { d: "Khammam", lat: 17.2473, lon: 80.1514, cities: ["Khammam", "Kothagudem", "Bhadrachalam"] },
            { d: "Nalgonda", lat: 17.0513, lon: 79.2676, cities: ["Nalgonda", "Suryapet", "Miryalaguda"] },
            { d: "Mahbubnagar", lat: 16.7488, lon: 77.9879, cities: ["Mahbubnagar", "Wanaparthy", "Gadwal"] },
            { d: "Adilabad", lat: 19.6641, lon: 78.5320, cities: ["Adilabad", "Mancherial", "Nirmal"] },
        ]
    },
    {
        state: "Tripura", code: "TR", lat: 23.9408, lon: 91.9882, districts: [
            { d: "West Tripura", lat: 23.8315, lon: 91.2868, cities: ["Agartala", "Jirania", "Mohanpur"] },
            { d: "South Tripura", lat: 23.2704, lon: 91.4998, cities: ["Udaipur", "Sabroom", "Belonia"] },
            { d: "North Tripura", lat: 24.4150, lon: 92.0177, cities: ["Dharmanagar", "Kailashahar"] },
            { d: "Gomati", lat: 23.5200, lon: 91.6800, cities: ["Udaipur", "Amarpur"] },
        ]
    },
    {
        state: "Uttar Pradesh", code: "UP", lat: 26.8467, lon: 80.9462, districts: [
            { d: "Lucknow", lat: 26.8467, lon: 80.9462, cities: ["Lucknow", "Bakshi Ka Talab", "Malihabad"] },
            { d: "Kanpur Nagar", lat: 26.4499, lon: 80.3319, cities: ["Kanpur", "Bithur", "Bilhaur"] },
            { d: "Agra", lat: 27.1767, lon: 78.0081, cities: ["Agra", "Firozabad", "Fatehpur Sikri"] },
            { d: "Varanasi", lat: 25.3176, lon: 82.9739, cities: ["Varanasi", "Sarnath", "Ramnagar"] },
            { d: "Allahabad", lat: 25.4358, lon: 81.8463, cities: ["Prayagraj", "Naini", "Jhunsi"] },
            { d: "Ghaziabad", lat: 28.6692, lon: 77.4538, cities: ["Ghaziabad", "Modinagar", "Loni", "Hapur"] },
            { d: "Meerut", lat: 28.9845, lon: 77.7064, cities: ["Meerut", "Hapur", "Modinagar", "Sardhana"] },
            { d: "Bareilly", lat: 28.3670, lon: 79.4304, cities: ["Bareilly", "Pilibhit", "Shahjahanpur"] },
            { d: "Mathura", lat: 27.4924, lon: 77.6737, cities: ["Mathura", "Vrindavan", "Govardhan"] },
            { d: "Aligarh", lat: 27.8974, lon: 78.0880, cities: ["Aligarh", "Hathras", "Iglas"] },
            { d: "Moradabad", lat: 28.8386, lon: 78.7733, cities: ["Moradabad", "Rampur", "Amroha"] },
            { d: "Gorakhpur", lat: 26.7606, lon: 83.3732, cities: ["Gorakhpur", "Deoria", "Basti"] },
            { d: "Saharanpur", lat: 29.9640, lon: 77.5460, cities: ["Saharanpur", "Muzaffarnagar", "Shamli"] },
            { d: "Jhansi", lat: 25.4484, lon: 78.5685, cities: ["Jhansi", "Lalitpur", "Mahoba"] },
            { d: "Noida (Gautam Buddha Nagar)", lat: 28.5355, lon: 77.3910, cities: ["Noida", "Greater Noida", "Dadri"] },
            { d: "Ayodhya", lat: 26.7922, lon: 82.1998, cities: ["Ayodhya", "Faizabad", "Milkipur"] },
            { d: "Lakhimpur Kheri", lat: 27.9497, lon: 80.7811, cities: ["Lakhimpur", "Kheri", "Gola Gokarnath"] },
            { d: "Muzaffarnagar", lat: 29.4736, lon: 77.7085, cities: ["Muzaffarnagar", "Kairana", "Budhana"] },
            { d: "Sultanpur", lat: 26.2596, lon: 82.0727, cities: ["Sultanpur", "Amethi", "Gauriganj"] },
        ]
    },
    {
        state: "Uttarakhand", code: "UK", lat: 30.0668, lon: 79.0193, districts: [
            { d: "Dehradun", lat: 30.3165, lon: 78.0322, cities: ["Dehradun", "Rishikesh", "Doiwala"] },
            { d: "Haridwar", lat: 29.9457, lon: 78.1642, cities: ["Haridwar", "Roorkee", "Laksar"] },
            { d: "Nainital", lat: 29.3919, lon: 79.4542, cities: ["Nainital", "Haldwani", "Bhimtal", "Ramnagar"] },
            { d: "Udham Singh Nagar", lat: 28.9784, lon: 79.5131, cities: ["Rudrapur", "Kashipur", "Kichha", "Bazpur"] },
            { d: "Almora", lat: 29.5971, lon: 79.6591, cities: ["Almora", "Bageshwar", "Ranikhet"] },
            { d: "Pauri Garhwal", lat: 29.5671, lon: 78.9498, cities: ["Pauri", "Kotdwar", "Dugadda"] },
            { d: "Tehri Garhwal", lat: 30.3781, lon: 78.4322, cities: ["Tehri", "New Tehri", "Narendra Nagar"] },
            { d: "Chamoli", lat: 30.4046, lon: 79.3333, cities: ["Gopeshwar", "Joshimath", "Badrinath"] },
        ]
    },
    {
        state: "West Bengal", code: "WB", lat: 22.9868, lon: 87.8550, districts: [
            { d: "Kolkata", lat: 22.5726, lon: 88.3639, cities: ["Kolkata", "Dum Dum", "Baranagar", "South Dum Dum"] },
            { d: "Howrah", lat: 22.5958, lon: 88.2636, cities: ["Howrah", "Uluberia", "Bally", "Serampore"] },
            { d: "North 24 Parganas", lat: 22.8510, lon: 88.5484, cities: ["Barasat", "Habra", "Bangaon", "Basirhat"] },
            { d: "South 24 Parganas", lat: 22.0920, lon: 88.4313, cities: ["Baruipur", "Diamond Harbour", "Budge Budge"] },
            { d: "Hooghly", lat: 22.9072, lon: 88.3974, cities: ["Chandernagore", "Chinsurah", "Arambagh", "Tarakeswar"] },
            { d: "Burdwan", lat: 23.2324, lon: 87.8615, cities: ["Asansol", "Durgapur", "Burdwan", "Kulti"] },
            { d: "Nadia", lat: 23.4688, lon: 88.5569, cities: ["Krishnanagar", "Kalyani", "Ranaghat", "Nabadwip"] },
            { d: "Murshidabad", lat: 24.1766, lon: 88.2682, cities: ["Berhampore", "Baharampur", "Jiaganj"] },
            { d: "Malda", lat: 25.0229, lon: 88.1409, cities: ["Malda", "English Bazar", "Habibpur"] },
            { d: "Jalpaiguri", lat: 26.5454, lon: 88.7281, cities: ["Jalpaiguri", "Dhupguri", "Malbazar"] },
            { d: "Darjeeling", lat: 27.0360, lon: 88.2627, cities: ["Darjeeling", "Siliguri", "Kurseong", "Mirik"] },
            { d: "Cooch Behar", lat: 26.3256, lon: 89.4456, cities: ["Cooch Behar", "Tufanganj", "Dinhata"] },
            { d: "Birbhum", lat: 23.8960, lon: 87.5344, cities: ["Suri", "Bolpur", "Rampurhat", "Shantiniketan"] },
            { d: "Bankura", lat: 23.2324, lon: 87.0753, cities: ["Bankura", "Bishnupur", "Sonamukhi"] },
            { d: "Purulia", lat: 23.3329, lon: 86.3649, cities: ["Purulia", "Jhalda", "Raghunathpur"] },
        ]
    },
    // Union Territories
    {
        state: "Delhi", code: "DL", lat: 28.7041, lon: 77.1025, districts: [
            { d: "Central Delhi", lat: 28.6430, lon: 77.2165, cities: ["Connaught Place", "Karol Bagh", "Paharganj"] },
            { d: "South Delhi", lat: 28.5272, lon: 77.1910, cities: ["Saket", "Hauz Khas", "Vasant Kunj", "Lajpat Nagar"] },
            { d: "East Delhi", lat: 28.6390, lon: 77.2960, cities: ["Preet Vihar", "Mandawali", "Gandhi Nagar"] },
            { d: "West Delhi", lat: 28.6540, lon: 77.0820, cities: ["Janakpuri", "Uttam Nagar", "Vikaspuri"] },
            { d: "North Delhi", lat: 28.7250, lon: 77.2120, cities: ["Civil Lines", "Rohini", "Pitampura"] },
            { d: "New Delhi", lat: 28.6139, lon: 77.2090, cities: ["New Delhi", "Chanakyapuri", "RK Puram"] },
            { d: "North West Delhi", lat: 28.7180, lon: 77.1050, cities: ["Rohini", "Mongolpuri", "Sultanpuri"] },
            { d: "South West Delhi", lat: 28.5724, lon: 77.0627, cities: ["Dwarka", "Najafgarh", "Palam"] },
        ]
    },
    {
        state: "Jammu & Kashmir", code: "JK", lat: 33.7782, lon: 76.5762, districts: [
            { d: "Srinagar", lat: 34.0837, lon: 74.7973, cities: ["Srinagar", "Budgam", "Ganderbal"] },
            { d: "Jammu", lat: 32.7266, lon: 74.8570, cities: ["Jammu", "Kathua", "Samba"] },
            { d: "Anantnag", lat: 33.7278, lon: 75.1510, cities: ["Anantnag", "Pahalgam", "Kokernag"] },
            { d: "Baramulla", lat: 34.2060, lon: 74.3418, cities: ["Baramulla", "Sopore", "Pattan"] },
            { d: "Kupwara", lat: 34.5218, lon: 74.2540, cities: ["Kupwara", "Handwara", "Karnah"] },
            { d: "Udhampur", lat: 32.9159, lon: 75.1392, cities: ["Udhampur", "Ramnagar", "Chenani"] },
            { d: "Pulwama", lat: 33.8743, lon: 74.8979, cities: ["Pulwama", "Shopian", "Tral"] },
        ]
    },
    {
        state: "Ladakh", code: "LA", lat: 34.1526, lon: 77.5771, districts: [
            { d: "Leh", lat: 34.1642, lon: 77.5848, cities: ["Leh", "Nubra", "Zanskar"] },
            { d: "Kargil", lat: 34.5539, lon: 76.1349, cities: ["Kargil", "Sankoo", "Zanskar"] },
        ]
    },
    {
        state: "Puducherry", code: "PY", lat: 11.9416, lon: 79.8083, districts: [
            { d: "Puducherry", lat: 11.9416, lon: 79.8083, cities: ["Puducherry", "Villianur", "Ariyankuppam"] },
            { d: "Karaikal", lat: 10.9254, lon: 79.8380, cities: ["Karaikal", "Thirunallar"] },
        ]
    },
    {
        state: "Chandigarh", code: "CH", lat: 30.7333, lon: 76.7794, districts: [
            { d: "Chandigarh", lat: 30.7333, lon: 76.7794, cities: ["Chandigarh", "Manimajra", "Panchkula"] },
        ]
    },
    {
        state: "Andaman & Nicobar Islands", code: "AN", lat: 11.7401, lon: 92.6586, districts: [
            { d: "South Andaman", lat: 11.6234, lon: 92.7265, cities: ["Port Blair", "Aberdeen Bazar"] },
            { d: "North & Middle Andaman", lat: 12.8985, lon: 92.8965, cities: ["Rangat", "Mayabunder"] },
        ]
    },
    {
        state: "Lakshadweep", code: "LD", lat: 10.5667, lon: 72.6417, districts: [
            { d: "Lakshadweep", lat: 10.5667, lon: 72.6417, cities: ["Kavaratti", "Agatti", "Andrott"] },
        ]
    },
    {
        state: "Dadra & Nagar Haveli and Daman & Diu", code: "DN", lat: 20.1809, lon: 73.0169, districts: [
            { d: "Dadra & Nagar Haveli", lat: 20.1809, lon: 73.0169, cities: ["Silvassa", "Amli"] },
            { d: "Daman", lat: 20.3974, lon: 72.8328, cities: ["Daman", "Vapi"] },
            { d: "Diu", lat: 20.7139, lon: 70.9875, cities: ["Diu"] },
        ]
    },
];

/* ── Build flat search index ──────────────────────────────────────
   Each entry: { name, type, state, district, lat, lon, display }
   type: 'state' | 'district' | 'city'
*/
const INDIA_INDEX = [];

INDIA_GEO.forEach(s => {
    INDIA_INDEX.push({ name: s.state, type: 'state', state: s.state, lat: s.lat, lon: s.lon, display: s.state });
    s.districts.forEach(d => {
        INDIA_INDEX.push({ name: d.d, type: 'district', state: s.state, district: d.d, lat: d.lat, lon: d.lon, display: `${d.d}, ${s.state}` });
        (d.cities || []).forEach(c => {
            INDIA_INDEX.push({ name: c, type: 'city', state: s.state, district: d.d, lat: d.lat, lon: d.lon, display: `${c} — ${d.d}, ${s.state}` });
        });
    });
});

/** Search INDIA_INDEX. Returns top N results sorted by relevance */
function searchIndia(q, limit = 10) {
    if (!q || q.length < 2) return [];
    const ql = q.toLowerCase().trim();
    return INDIA_INDEX
        .filter(e => e.name.toLowerCase().includes(ql) || e.display.toLowerCase().includes(ql))
        .sort((a, b) => {
            const an = a.name.toLowerCase().startsWith(ql) ? 0 : 1;
            const bn = b.name.toLowerCase().startsWith(ql) ? 0 : 1;
            if (an !== bn) return an - bn;
            // Priority: district > state > city
            const tp = { district: 0, state: 1, city: 2 };
            return (tp[a.type] || 2) - (tp[b.type] || 2);
        })
        .slice(0, limit);
}
