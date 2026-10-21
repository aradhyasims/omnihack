// Partner, supporter and member logos shown on the homepage, grouped into scrolling rows.
// Files live in public/partners/ (180 px tall JPGs). Only list organizations that have agreed to be shown.
export type PartnerLogo = { name: string; file: string };
export type PartnerGroup = { title: string; direction: "right" | "left"; logos: PartnerLogo[] };

export const PARTNER_GROUPS: PartnerGroup[] = [
  {
    title: "Government & academic partners",
    direction: "right",
    logos: [
      { name: "Department of Technical Education, Government of Karnataka", file: "dte-karnataka.jpg" },
      { name: "Government Engineering College Ramanagara, K-tech and LEAP", file: "gec-ramanagara-ktech-leap.jpg" },
      { name: "Visvesvaraya Technological University, Belagavi", file: "vtu.jpg" },
      { name: "Adichunchanagiri University", file: "adichunchanagiri-university.jpg" },
      { name: "IIIT Dharwad Research Park", file: "iiit-dharwad-research-park.jpg" },
      { name: "National Skill Development Corporation", file: "nsdc.jpg" },
      { name: "Skill India — Electronics Sector Skills Council of India", file: "essci-skill-india.jpg" },
    ],
  },
  {
    title: "Industry bodies & associations",
    direction: "left",
    logos: [
      { name: "nasscom", file: "nasscom.jpg" },
      { name: "India Electronics & Semiconductor Association", file: "iesa.jpg" },
      { name: "IEEE", file: "ieee.jpg" },
      { name: "The Institution of Engineers (India)", file: "institution-of-engineers-india.jpg" },
      { name: "Federation of Karnataka Chambers of Commerce and Industry", file: "fkcci.jpg" },
      { name: "Bangalore Chamber of Industry and Commerce", file: "bcic.jpg" },
      { name: "International Federation of Electric Vehicle Association", file: "ifeva.jpg" },
      { name: "Indo Nippon Business Council & Academia Collaboration", file: "inbcc.jpg" },
      { name: "Rotary International District 3191–3192", file: "rotary-3191-3192.jpg" },
      { name: "Rebuild India", file: "rebuild-india.jpg" },
    ],
  },
  {
    title: "Industry partners",
    direction: "right",
    logos: [
      { name: "Silicon Microsystems", file: "silicon-microsystems.jpg" },
      { name: "Caliber Interconnects", file: "caliber-interconnects.jpg" },
      { name: "Dilabs Systems", file: "dilabs-systems.jpg" },
      { name: "Elfonze Technologies", file: "elfonze-technologies.jpg" },
      { name: "Galore Systems", file: "galore-systems.jpg" },
      { name: "Tantragyaan", file: "tantragyaan.jpg" },
      { name: "Omni Skills Olympiad", file: "omni-skills-olympiad.jpg" },
    ],
  },
];
