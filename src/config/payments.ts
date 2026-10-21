// Platform hosting fee and the company account it is paid into.
// Kept in code (not the database) so the bank details shown to organizers can only change through a reviewed deploy.
export const HOSTING_FEE = {
  /** ₹10,000 per competition, in paise. */
  amountMinor: 10_000_00,
  currency: "INR",
  payee: {
    accountName: "Silicon Micro Systems",
    accountNumber: "89490500000025",
    ifsc: "BARB0VJGABZ",
    bank: "Bank of Baroda",
    branch: "Gandhi Bazar, Bengaluru",
  },
} as const;

/** Payment methods organizers and participants can use for bank transfers in India. */
export const BANK_TRANSFER_METHODS = "NEFT, RTGS or IMPS";
