/**
 * Product family taxonomy for assortment / complement analysis.
 * Keyword-based — works without LLM; provider-agnostic.
 */

export type ProductFamily = {
  id: string;
  label: string;
  categoryHint: string | null;
  patterns: RegExp[];
};

export const PRODUCT_FAMILIES: ProductFamily[] = [
  {
    id: "fps_mouse",
    label: "FPS-mus",
    categoryHint: "Gaming",
    patterns: [/\bfps\s*mouse\b/i, /\bfps\s*mus\b/i],
  },
  {
    id: "mmo_mouse",
    label: "MMO-mus",
    categoryHint: "Gaming",
    patterns: [/\bmmo\s*mouse\b/i, /\bmmo\s*mus\b/i, /12[-\s]?button\s*mouse/i],
  },
  {
    id: "ultralight_mouse",
    label: "Ultralett mus",
    categoryHint: "Gaming",
    patterns: [/ultra\s*light\s*mouse/i, /ultralight\s*mouse/i, /ultralett\s*mus/i, /\bsuperlight\b/i],
  },
  {
    id: "wireless_mouse",
    label: "Trådløs mus",
    categoryHint: "Data & IT",
    patterns: [/wireless\s*mouse/i, /trådløs\s*mus/i, /cordless\s*mouse/i],
  },
  {
    id: "vertical_mouse",
    label: "Vertikal mus",
    categoryHint: "Data & IT",
    patterns: [/vertical\s*mouse/i, /vertikal\s*mus/i, /ergonomic\s*vertical/i],
  },
  {
    id: "ergonomic_mouse",
    label: "Ergonomisk mus",
    categoryHint: "Data & IT",
    patterns: [/ergonomic\s*mouse/i, /ergonomisk\s*mus/i],
  },
  {
    id: "bluetooth_mouse",
    label: "Bluetooth-mus",
    categoryHint: "Data & IT",
    patterns: [/bluetooth\s*mouse/i, /bluetooth\s*mus/i, /bt\s*mouse/i],
  },
  {
    id: "trackball",
    label: "Trackball",
    categoryHint: "Data & IT",
    patterns: [/track\s*ball/i, /trackball/i],
  },
  {
    id: "office_mouse",
    label: "Kontormus",
    categoryHint: "Data & IT",
    patterns: [/office\s*mouse/i, /kontor\s*mus/i, /business\s*mouse/i],
  },
  {
    id: "travel_mouse",
    label: "Reisemus",
    categoryHint: "Data & IT",
    patterns: [/travel\s*mouse/i, /reise\s*mus/i, /portable\s*mouse/i, /mini\s*mouse/i],
  },
  {
    id: "gaming_mouse",
    label: "Gamingmus",
    categoryHint: "Gaming",
    patterns: [
      /\bgaming\s*mouse\b/i,
      /\bgaming\s*mus\b/i,
      /\bmouse\b.*gaming/i,
      /\bgamer\s*mouse\b/i,
      /\brgb\s*mouse\b/i,
    ],
  },
  {
    id: "mouse",
    label: "Mus",
    categoryHint: "Data & IT",
    patterns: [/\bmouse\b/i, /\bmus\b/i, /\bmice\b/i],
  },
  {
    id: "mouse_pad",
    label: "Musematter",
    categoryHint: "Gaming",
    patterns: [/mouse\s*pad/i, /musematte/i, /desk\s*mat/i, /deskmat/i],
  },
  {
    id: "mouse_bungee",
    label: "Mouse bungee",
    categoryHint: "Gaming",
    patterns: [/bungee/i, /cable\s*holder/i],
  },
  {
    id: "keyboard_60",
    label: "60 % tastatur",
    categoryHint: "Gaming",
    patterns: [/\b60\s*%?\s*keyboard/i, /\b60\s*%?\s*tastatur/i],
  },
  {
    id: "keyboard_65",
    label: "65 % tastatur",
    categoryHint: "Gaming",
    patterns: [/\b65\s*%?\s*keyboard/i, /\b65\s*%?\s*tastatur/i, /\b65\s*percent/i],
  },
  {
    id: "keyboard_75",
    label: "75 % tastatur",
    categoryHint: "Gaming",
    patterns: [/\b75\s*%?\s*keyboard/i, /\b75\s*%?\s*tastatur/i],
  },
  {
    id: "keyboard_tkl",
    label: "TKL-tastatur",
    categoryHint: "Gaming",
    patterns: [/\btkl\b/i, /tenkeyless/i, /tkl\s*keyboard/i],
  },
  {
    id: "keyboard_fullsize",
    label: "Fullsize-tastatur",
    categoryHint: "Data & IT",
    patterns: [/full\s*size\s*keyboard/i, /fullsize\s*keyboard/i, /full\s*size\s*tastatur/i, /100\s*%?\s*keyboard/i],
  },
  {
    id: "mechanical_keyboard",
    label: "Mekanisk tastatur",
    categoryHint: "Gaming",
    patterns: [
      /mechanical\s*keyboard/i,
      /mekanisk\s*tastatur/i,
      /\bmechanical\b.*\bkey/i,
    ],
  },
  {
    id: "gaming_keyboard",
    label: "Gamingtastatur",
    categoryHint: "Gaming",
    patterns: [
      /gaming\s*keyboard/i,
      /gaming\s*tastatur/i,
      /gamer\s*keyboard/i,
      /\brgb\s*keyboard\b/i,
    ],
  },
  {
    id: "office_keyboard",
    label: "Kontortastatur",
    categoryHint: "Data & IT",
    patterns: [/office\s*keyboard/i, /kontor\s*tastatur/i, /membrane\s*keyboard/i, /membran\s*tastatur/i],
  },
  {
    id: "keyboard",
    label: "Tastatur",
    categoryHint: "Data & IT",
    patterns: [/keyboard/i, /tastatur/i],
  },
  {
    id: "wrist_rest",
    label: "Håndleddsstøtter",
    categoryHint: "Data & IT",
    patterns: [/wrist\s*rest/i, /håndledd/i, /palm\s*rest/i],
  },
  {
    id: "headset",
    label: "Headset",
    categoryHint: "Gaming",
    patterns: [/headset/i, /headphones?/i, /hodetelefon/i, /earbuds?/i, /ørepropp/i],
  },
  {
    id: "webcam",
    label: "Webkamera",
    categoryHint: "Data & IT",
    patterns: [/webcam/i, /web\s*cam/i, /camera.*pc/i],
  },
  {
    id: "docking_station",
    label: "Dockingstasjoner",
    categoryHint: "Data & IT",
    patterns: [/docking\s*station/i, /dock\s*station/i, /\bdocking\b/i],
  },
  {
    id: "usb_c_hub",
    label: "USB-C hub",
    categoryHint: "Data & IT",
    patterns: [/usb[-\s]?c\s*hub/i, /usb[-\s]?c\s*dock/i, /\bhub\b.*usb/i],
  },
  {
    id: "usb_c_cable",
    label: "USB-C kabler",
    categoryHint: "Mobil & Tilbehør",
    patterns: [/usb[-\s]?c\s*cable/i, /usb[-\s]?c\s*kabel/i, /type[-\s]?c\s*cable/i],
  },
  {
    id: "hdmi_cable",
    label: "HDMI-kabler",
    categoryHint: "TV, Lyd & Bilde",
    patterns: [/hdmi\s*cable/i, /hdmi\s*kabel/i, /\bhdmi\b/i],
  },
  {
    id: "displayport_cable",
    label: "DisplayPort-kabler",
    categoryHint: "Data & IT",
    patterns: [/display\s*port/i, /displayport/i, /\bdp\s*cable\b/i],
  },
  {
    id: "ethernet_cable",
    label: "Ethernet-kabler",
    categoryHint: "Data & IT",
    patterns: [/ethernet\s*cable/i, /ethernet\s*kabel/i, /cat\s*[56]/i, /nettverkskabel/i],
  },
  {
    id: "phone_case",
    label: "Mobildeksler",
    categoryHint: "Mobil & Tilbehør",
    patterns: [
      /phone\s*case/i,
      /mobildeksel/i,
      /mobile\s*phone\s*case/i,
      /\bcase\b.*iphone/i,
      /iphone.*\bcase\b/i,
      /samsung.*\bcase\b/i,
      /telefon.*deksel/i,
      /mobil.*deksel/i,
    ],
  },
  {
    id: "screen_protector",
    label: "Skjermbeskyttere",
    categoryHint: "Mobil & Tilbehør",
    patterns: [/screen\s*protector/i, /skjermbeskytter/i, /tempered\s*glass/i],
  },
  {
    id: "powerbank",
    label: "Powerbank",
    categoryHint: "Mobil & Tilbehør",
    patterns: [/power\s*bank/i, /powerbank/i, /nødlader/i],
  },
  {
    id: "magsafe",
    label: "MagSafe-tilbehør",
    categoryHint: "Mobil & Tilbehør",
    patterns: [/magsafe/i, /mag\s*safe/i],
  },
  {
    id: "charger",
    label: "Ladere",
    categoryHint: "Mobil & Tilbehør",
    patterns: [/\bcharger\b/i, /\blader\b/i, /wall\s*adapter/i, /gallium/i],
  },
  {
    id: "gaming_chair",
    label: "Gamingstoler",
    categoryHint: "Gaming",
    patterns: [/gaming\s*chair/i, /gamingstol/i],
  },
  {
    id: "floor_mat",
    label: "Gulvmatter",
    categoryHint: "Gaming",
    patterns: [/floor\s*mat/i, /chair\s*mat/i, /gulvmatte/i],
  },
  {
    id: "led_strip",
    label: "LED-strips",
    categoryHint: "Hjem & Fritid",
    patterns: [/led\s*strip/i, /strip\s*light/i, /led\s*tape/i],
  },
  {
    id: "led_lighting",
    label: "LED / RGB-belysning",
    categoryHint: "Hjem & Fritid",
    patterns: [/\bled\b/i, /\brgb\b.*light/i, /desk\s*lamp/i, /rgb\s*light/i],
  },
  {
    id: "mini_pc",
    label: "Mini-PC",
    categoryHint: "Data & IT",
    patterns: [/mini\s*pc/i, /minipc/i, /nuc\b/i],
  },
  {
    id: "monitor_stand",
    label: "Skjermstativ",
    categoryHint: "Data & IT",
    patterns: [/monitor\s*stand/i, /skjermstativ/i],
  },
  {
    id: "microphone",
    label: "Mikrofon",
    categoryHint: "Gaming",
    patterns: [/\bmicrophone\b/i, /\bmikrofon\b/i, /\bmic\b/i, /condenser\s*mic/i],
  },
  {
    id: "laptop_stand",
    label: "Laptopstativ",
    categoryHint: "Data & IT",
    patterns: [/laptop\s*stand/i, /laptopstativ/i, /notebook\s*stand/i, /cooling\s*pad/i],
  },
  {
    id: "cable_management",
    label: "Kabelorganisering",
    categoryHint: "Data & IT",
    patterns: [/cable\s*manag/i, /kabelorgan/i, /cable\s*clip/i, /cable\s*sleeve/i, /cable\s*tray/i],
  },
  {
    id: "monitor_arm",
    label: "Skjermarm",
    categoryHint: "Data & IT",
    patterns: [/monitor\s*arm/i, /skjermarm/i, /monitor\s*mount/i, /gas\s*spring\s*arm/i],
  },
  {
    id: "bluetooth_speaker",
    label: "Bluetooth-høyttalere",
    categoryHint: "TV, Lyd & Bilde",
    patterns: [/bluetooth\s*speaker/i, /bluetooth\s*høyttaler/i, /portable\s*speaker/i],
  },
  {
    id: "pc_speaker",
    label: "PC-høyttalere",
    categoryHint: "TV, Lyd & Bilde",
    patterns: [/pc\s*speaker/i, /computer\s*speaker/i, /desktop\s*speaker/i, /pc\s*høyttaler/i],
  },
  {
    id: "speaker",
    label: "Høyttalere",
    categoryHint: "TV, Lyd & Bilde",
    patterns: [/speaker/i, /høyttaler/i, /soundbar/i],
  },
  {
    id: "ssd",
    label: "SSD / lagring",
    categoryHint: "Data & IT",
    patterns: [/\bssd\b/i, /nvme/i, /external\s*drive/i, /harddisk/i, /\blagring\b/i],
  },
  {
    id: "ram",
    label: "RAM",
    categoryHint: "Data & IT",
    patterns: [/\bram\b/i, /ddr[45]/i, /memory\s*module/i, /minnepinne/i],
  },
  {
    id: "cpu_cooler",
    label: "CPU-kjølere",
    categoryHint: "Data & IT",
    patterns: [/cpu\s*cooler/i, /cpu\s*kjøler/i, /air\s*cooler/i, /aio\s*cooler/i, /liquid\s*cooler/i],
  },
  {
    id: "case_fan",
    label: "Kabinettvifter",
    categoryHint: "Data & IT",
    patterns: [/case\s*fan/i, /kabinett\s*vifte/i, /pc\s*fan/i, /chassis\s*fan/i],
  },
  {
    id: "network",
    label: "Nettverksutstyr",
    categoryHint: "Data & IT",
    patterns: [/router/i, /wifi\s*6/i, /mesh\s*wifi/i, /nettverk/i, /ethernet\s*switch/i],
  },
  {
    id: "smart_bulb",
    label: "Smartpærer",
    categoryHint: "Hjem & Fritid",
    patterns: [/smart\s*bulb/i, /smart\s*pære/i, /smarte\s*lys/i, /wifi\s*bulb/i],
  },
  {
    id: "smart_plug",
    label: "Smart plugs",
    categoryHint: "Hjem & Fritid",
    patterns: [/smart\s*plug/i, /smartplugg/i, /wifi\s*plug/i],
  },
  {
    id: "security_camera",
    label: "Overvåkningskamera",
    categoryHint: "Hjem & Fritid",
    patterns: [
      /security\s*camera/i,
      /overvåkningskamera/i,
      /surveillance/i,
      /ip\s*camera/i,
      /doorbell\s*camera/i,
    ],
  },
  {
    id: "smart_home",
    label: "Smart-hjem",
    categoryHint: "Hjem & Fritid",
    patterns: [/smart\s*home/i, /smart\-?\s*hjem/i],
  },
  {
    id: "controller",
    label: "Kontrollere",
    categoryHint: "Gaming",
    patterns: [/gamepad/i, /controller/i, /kontroller/i, /joystick/i],
  },
  {
    id: "card_reader",
    label: "Kortlesere",
    categoryHint: "Data & IT",
    patterns: [/card\s*reader/i, /kortleser/i, /sd\s*reader/i, /cfexpress/i],
  },
  {
    id: "adapter",
    label: "Adaptere",
    categoryHint: "Data & IT",
    patterns: [/\badapter\b/i, /\badaptere\b/i, /dongle/i, /konverter/i],
  },
  {
    id: "precision_tools",
    label: "Elektriske presisjonsverktøy",
    categoryHint: "Data & IT",
    patterns: [
      /precision\s*screwdriver/i,
      /presisjon/i,
      /electric\s*screwdriver/i,
      /elektrisk\s*skrutrekker/i,
      /repair\s*kit/i,
      /ifixit/i,
    ],
  },
  // --- Streaming / content ---
  {
    id: "capture_card",
    label: "Capture cards",
    categoryHint: "Gaming",
    patterns: [/capture\s*card/i, /spillinnspiller/i, /elgato\s*hd/i, /4k\s*60\s*pro/i],
  },
  {
    id: "stream_deck",
    label: "Stream Deck",
    categoryHint: "Gaming",
    patterns: [/stream\s*deck/i, /streamdeck/i, /macropad/i, /macro\s*pad/i],
  },
  {
    id: "sim_racing",
    label: "Sim-racing",
    categoryHint: "Gaming",
    patterns: [/sim\s*racing/i, /racing\s*wheel/i, /ratt\s*og\s*pedal/i, /direct\s*drive\s*wheel/i, /logitech\s*g29/i],
  },
  {
    id: "flight_sim",
    label: "Flight simulator",
    categoryHint: "Gaming",
    patterns: [/flight\s*sim/i, /flight\s*stick/i, /hotas/i, /yoke\b/i, /rudder\s*pedal/i],
  },
  {
    id: "boom_arm",
    label: "Boom arm",
    categoryHint: "Gaming",
    patterns: [/boom\s*arm/i, /mic\s*arm/i, /mikrofonarm/i, /broadcast\s*arm/i],
  },
  {
    id: "green_screen",
    label: "Green screen",
    categoryHint: "Gaming",
    patterns: [/green\s*screen/i, /chroma\s*key/i, /grønn\s*duk/i],
  },
  {
    id: "ring_light",
    label: "Ring light",
    categoryHint: "Hjem & Fritid",
    patterns: [/ring\s*light/i, /ringlys/i, /selfie\s*light/i],
  },
  {
    id: "video_light",
    label: "Videolys",
    categoryHint: "Hjem & Fritid",
    patterns: [/video\s*light/i, /led\s*panel\s*light/i, /softbox/i, /key\s*light/i, /videolys/i],
  },
  {
    id: "audio_interface",
    label: "Lydkort",
    categoryHint: "TV, Lyd & Bilde",
    patterns: [/audio\s*interface/i, /lydkort/i, /usb\s*audio/i, /focusrite/i, /scarlett/i],
  },
  // --- Mobil extras ---
  {
    id: "lightning_cable",
    label: "Lightning-kabler",
    categoryHint: "Mobil & Tilbehør",
    patterns: [/lightning\s*cable/i, /lightning\s*kabel/i, /apple\s*lightning/i],
  },
  {
    id: "qi_charger",
    label: "Qi-ladere",
    categoryHint: "Mobil & Tilbehør",
    patterns: [/\bqi\b/i, /wireless\s*charg/i, /trådløs\s*lader/i, /inductive\s*charg/i],
  },
  {
    id: "car_charger",
    label: "Billadere",
    categoryHint: "Bil & Motor",
    patterns: [/car\s*charger/i, /billader/i, /cigarette\s*lighter\s*charg/i],
  },
  {
    id: "phone_mount",
    label: "Telefonholdere",
    categoryHint: "Bil & Motor",
    patterns: [/phone\s*mount/i, /phone\s*holder/i, /telefonholder/i, /car\s*mount/i, /mag\s*mount/i],
  },
  {
    id: "phone_stand",
    label: "Mobilstativ",
    categoryHint: "Mobil & Tilbehør",
    patterns: [/phone\s*stand/i, /mobilstativ/i, /desktop\s*phone\s*stand/i],
  },
  // --- Smart home extras ---
  {
    id: "smart_sensor",
    label: "Smartsensor",
    categoryHint: "Hjem & Fritid",
    patterns: [/smart\s*sensor/i, /motion\s*sensor/i, /door\s*sensor/i, /bevegelsessensor/i],
  },
  {
    id: "doorbell",
    label: "Dørklokker",
    categoryHint: "Hjem & Fritid",
    patterns: [/doorbell/i, /dørklokke/i, /video\s*doorbell/i],
  },
  {
    id: "smart_switch",
    label: "Smarte brytere",
    categoryHint: "Hjem & Fritid",
    patterns: [/smart\s*switch/i, /smart\s*bryter/i, /wifi\s*switch/i],
  },
  {
    id: "air_sensor",
    label: "Luftsensor",
    categoryHint: "Hjem & Fritid",
    patterns: [/air\s*quality/i, /luftkvalitet/i, /co2\s*sensor/i, /pm2\.?5/i],
  },
  {
    id: "temp_sensor",
    label: "Temperaturmåler",
    categoryHint: "Hjem & Fritid",
    patterns: [/temp(erature)?\s*sensor/i, /temperaturmåler/i, /hygrometer/i, /thermo[-\s]?hygrometer/i],
  },
  {
    id: "robot_vacuum",
    label: "Robotstøvsuger",
    categoryHint: "Hjem & Fritid",
    patterns: [/robot\s*vacuum/i, /robotstøvsuger/i, /robot\s*cleaner/i, /roborock/i, /roomba/i],
  },
  // --- Kontor extras ---
  {
    id: "ergonomic_keyboard",
    label: "Ergonomisk tastatur",
    categoryHint: "Data & IT",
    patterns: [/ergonomic\s*keyboard/i, /ergonomisk\s*tastatur/i, /split\s*keyboard/i],
  },
  {
    id: "document_holder",
    label: "Dokumentholder",
    categoryHint: "Data & IT",
    patterns: [/document\s*holder/i, /dokumentholder/i, /copy\s*holder/i],
  },
  {
    id: "headphone_stand",
    label: "Hodetelefonstativ",
    categoryHint: "Data & IT",
    patterns: [/headphone\s*stand/i, /headset\s*stand/i, /hodetelefonstativ/i],
  },
  // --- TV & lyd extras ---
  {
    id: "soundbar",
    label: "Soundbar",
    categoryHint: "TV, Lyd & Bilde",
    patterns: [/sound\s*bar/i, /soundbar/i],
  },
  {
    id: "optical_cable",
    label: "Optisk kabel",
    categoryHint: "TV, Lyd & Bilde",
    patterns: [/optical\s*cable/i, /toslink/i, /optisk\s*kabel/i, /spdif/i],
  },
  {
    id: "dac",
    label: "DAC",
    categoryHint: "TV, Lyd & Bilde",
    patterns: [/\bdac\b/i, /digital\s*to\s*analog/i, /usb\s*dac/i],
  },
  {
    id: "headphone_amp",
    label: "Hodetelefonforsterker",
    categoryHint: "TV, Lyd & Bilde",
    patterns: [/headphone\s*amp/i, /headphone\s*amplifier/i, /hodetelefonforsterker/i],
  },
  // --- Foto & video ---
  {
    id: "camera_tripod",
    label: "Kamerastativ",
    categoryHint: "Foto & Video",
    patterns: [/tripod/i, /kamerastativ/i, /camera\s*stand/i],
  },
  {
    id: "camera_light",
    label: "Kameralys",
    categoryHint: "Foto & Video",
    patterns: [/camera\s*light/i, /kameralys/i, /on[-\s]?camera\s*light/i],
  },
  {
    id: "camera_bag",
    label: "Kameraryggsekk",
    categoryHint: "Foto & Video",
    patterns: [/camera\s*bag/i, /camera\s*backpack/i, /kameraryggsekk/i, /fotoveske/i],
  },
  {
    id: "sd_card",
    label: "SD-kort",
    categoryHint: "Foto & Video",
    patterns: [/\bsd\s*card\b/i, /microsd/i, /minnekort/i, /cfexpress/i],
  },
  {
    id: "battery_charger",
    label: "Batterilader",
    categoryHint: "Foto & Video",
    patterns: [/battery\s*charger/i, /batterilader/i, /camera\s*battery/i],
  },
  {
    id: "lens_accessory",
    label: "Objektivtilbehør",
    categoryHint: "Foto & Video",
    patterns: [/lens\s*hood/i, /lens\s*filter/i, /objektiv/i, /nd\s*filter/i, /uv\s*filter/i],
  },
  // --- Bil ---
  {
    id: "dashcam",
    label: "Dashcam",
    categoryHint: "Bil & Motor",
    patterns: [/dash\s*cam/i, /dashcam/i, /bilkamera/i],
  },
  {
    id: "car_bt_adapter",
    label: "Bluetooth-adapter bil",
    categoryHint: "Bil & Motor",
    patterns: [/bluetooth\s*adapter/i, /car\s*bluetooth/i, /aux\s*bluetooth/i],
  },
  {
    id: "air_compressor",
    label: "Luftkompressor",
    categoryHint: "Bil & Motor",
    patterns: [/air\s*compressor/i, /luftkompressor/i, /tyre\s*inflator/i, /tire\s*inflator/i],
  },
  {
    id: "jump_starter",
    label: "Startbooster",
    categoryHint: "Bil & Motor",
    patterns: [/jump\s*starter/i, /startbooster/i, /booster\s*pack/i, /car\s*jump/i],
  },
  {
    id: "obd_reader",
    label: "OBD-leser",
    categoryHint: "Bil & Motor",
    patterns: [/\bobd\b/i, /obd[-\s]?ii/i, /obd2/i, /elm327/i],
  },
  // --- Maker / lagring ---
  {
    id: "nas",
    label: "NAS",
    categoryHint: "Data & IT",
    patterns: [/\bnas\b/i, /network\s*attached\s*storage/i, /synology/i, /qnap/i],
  },
  {
    id: "server",
    label: "Server",
    categoryHint: "Data & IT",
    patterns: [/\bserver\b/i, /rack\s*server/i, /homelab/i],
  },
  {
    id: "ai_pc",
    label: "AI-PC",
    categoryHint: "Data & IT",
    patterns: [/\bai\s*pc\b/i, /npu\b/i, /copilot\+\s*pc/i],
  },
  {
    id: "printer_3d",
    label: "3D-printer",
    categoryHint: "Data & IT",
    patterns: [/3d\s*printer/i, /3d\s*print/i, /filament/i, /bambu\s*lab/i],
  },
  {
    id: "fpv_drone",
    label: "FPV-drone",
    categoryHint: "Hjem & Fritid",
    patterns: [/fpv/i, /drone/i, /quadcopter/i],
  },
  {
    id: "retro_gaming",
    label: "Retro gaming",
    categoryHint: "Gaming",
    patterns: [/retro\s*gaming/i, /retro\s*console/i, /emulation\s*stick/i, /mini\s*console/i],
  },
];

/** Anchor family → complementary families that should exist in assortment. */
export const COMPLEMENT_RULES: Array<{
  id: string;
  name: string;
  category: string | null;
  chain: string[];
}> = [
  {
    id: "gaming_desk_ecosystem",
    name: "Gaming desk-økosystem",
    category: "Gaming",
    chain: [
      "gaming_mouse",
      "mouse_pad",
      "mechanical_keyboard",
      "headset",
      "webcam",
      "microphone",
      "led_lighting",
      "monitor_arm",
      "laptop_stand",
      "usb_c_hub",
      "cable_management",
    ],
  },
  {
    id: "mouse_ecosystem",
    name: "Mus-økosystem",
    category: "Gaming",
    chain: ["mouse", "gaming_mouse", "mouse_pad", "mouse_bungee"],
  },
  {
    id: "keyboard_ecosystem",
    name: "Tastatur-økosystem",
    category: "Data & IT",
    chain: ["keyboard", "mechanical_keyboard", "wrist_rest", "mouse"],
  },
  {
    id: "usb_c_ecosystem",
    name: "USB-C-økosystem",
    category: "Data & IT",
    chain: ["usb_c_cable", "usb_c_hub", "charger", "cable_management"],
  },
  {
    id: "mobile_ecosystem",
    name: "Mobil-økosystem",
    category: "Mobil & Tilbehør",
    chain: ["phone_case", "screen_protector", "charger", "powerbank", "usb_c_cable"],
  },
  {
    id: "office_ecosystem",
    name: "Hjemmekontor-økosystem",
    category: "Data & IT",
    chain: ["keyboard", "mouse", "webcam", "headset", "usb_c_hub", "monitor_arm", "laptop_stand"],
  },
  {
    id: "av_ecosystem",
    name: "TV & Lyd-økosystem",
    category: "TV, Lyd & Bilde",
    chain: ["speaker", "headset", "cable_management"],
  },
  {
    id: "chair_ecosystem",
    name: "Stol-økosystem",
    category: "Gaming",
    chain: ["gaming_chair", "floor_mat"],
  },
];

/** Gap rules: if anchorCount >= threshold and missingCount < expectedMin → gap. */
export const GAP_RULES: Array<{
  id: string;
  anchorFamily: string;
  missingFamily: string;
  anchorMin: number;
  expectedMin: number;
  ratio?: number;
}> = [
  { id: "mice_need_pads", anchorFamily: "gaming_mouse", missingFamily: "mouse_pad", anchorMin: 5, expectedMin: 3, ratio: 0.25 },
  { id: "mice_need_pads_generic", anchorFamily: "mouse", missingFamily: "mouse_pad", anchorMin: 8, expectedMin: 3, ratio: 0.2 },
  { id: "keyboards_need_wrist", anchorFamily: "keyboard", missingFamily: "wrist_rest", anchorMin: 5, expectedMin: 2, ratio: 0.2 },
  { id: "usb_c_need_hub", anchorFamily: "usb_c_cable", missingFamily: "usb_c_hub", anchorMin: 5, expectedMin: 2, ratio: 0.25 },
  { id: "chairs_need_mats", anchorFamily: "gaming_chair", missingFamily: "floor_mat", anchorMin: 2, expectedMin: 2 },
  { id: "cases_need_glass", anchorFamily: "phone_case", missingFamily: "screen_protector", anchorMin: 8, expectedMin: 4, ratio: 0.3 },
  { id: "mice_need_headset", anchorFamily: "gaming_mouse", missingFamily: "headset", anchorMin: 10, expectedMin: 3, ratio: 0.2 },
  { id: "office_need_webcam", anchorFamily: "keyboard", missingFamily: "webcam", anchorMin: 8, expectedMin: 2 },
];

export function matchFamily(title: string, category?: string | null): string | null {
  const text = `${title} ${category || ""}`;
  // Prefer more specific families first (gaming_mouse before mouse, etc.)
  const ordered = [...PRODUCT_FAMILIES].sort((a, b) => {
    const priority = (id: string) => {
      if (
        id.startsWith("gaming_") ||
        id.startsWith("mechanical_") ||
        id.startsWith("bluetooth_") ||
        id.startsWith("vertical_") ||
        id.startsWith("ergonomic_") ||
        id.startsWith("office_") ||
        id.startsWith("keyboard_") ||
        id.startsWith("fps_") ||
        id.startsWith("mmo_") ||
        id.startsWith("ultralight_") ||
        id.startsWith("wireless_") ||
        id.startsWith("capture_") ||
        id.startsWith("stream_") ||
        id.startsWith("sim_") ||
        id.startsWith("flight_") ||
        id.startsWith("boom_") ||
        id.startsWith("green_") ||
        id.startsWith("ring_") ||
        id.startsWith("video_") ||
        id.startsWith("audio_") ||
        id.startsWith("smart_") ||
        id.startsWith("camera_") ||
        id.startsWith("car_") ||
        id.startsWith("jump_") ||
        id.startsWith("obd_") ||
        id.startsWith("air_") ||
        id.startsWith("temp_") ||
        id.startsWith("robot_") ||
        id.startsWith("lens_") ||
        id.startsWith("sd_") ||
        id.startsWith("battery_") ||
        id.startsWith("document_") ||
        id.startsWith("headphone_") ||
        id.startsWith("ergonomic_") ||
        id.startsWith("lightning_") ||
        id.startsWith("qi_") ||
        id.startsWith("phone_") ||
        id.startsWith("optical_") ||
        id.startsWith("printer_") ||
        id.startsWith("fpv_") ||
        id.startsWith("retro_") ||
        id.startsWith("custom_") ||
        id === "keyboard_60" ||
        id === "keyboard_fullsize" ||
        id === "nas" ||
        id === "dac" ||
        id === "soundbar" ||
        id === "dashcam" ||
        id === "doorbell" ||
        id === "phone_case" ||
        id === "magsafe" ||
        id === "docking_station" ||
        id === "led_strip" ||
        id === "smart_bulb" ||
        id === "smart_plug" ||
        id === "trackball" ||
        id === "travel_mouse"
      )
        return 0;
      if (id.includes("_")) return 1;
      return 2;
    };
    return priority(a.id) - priority(b.id);
  });
  for (const fam of ordered) {
    if (fam.patterns.some((p) => p.test(text))) return fam.id;
  }
  return null;
}

export function familyLabel(id: string): string {
  return PRODUCT_FAMILIES.find((f) => f.id === id)?.label || id;
}

export function countFamilies(
  products: Array<{ name: string; category?: string | null }>
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const p of products) {
    const fam = matchFamily(p.name, p.category);
    if (!fam) continue;
    counts[fam] = (counts[fam] || 0) + 1;
  }
  return counts;
}
