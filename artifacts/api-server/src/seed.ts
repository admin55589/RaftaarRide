import { db } from "@workspace/db";
import { usersTable, driversTable, ridesTable } from "@workspace/db/schema";

const users = [
  { name: "Arjun Sharma", email: "arjun@example.com", phone: "+91 98765 43210", status: "active" },
  { name: "Priya Patel", email: "priya@example.com", phone: "+91 87654 32109", status: "active" },
  { name: "Rahul Verma", email: "rahul@example.com", phone: "+91 76543 21098", status: "active" },
  { name: "Sneha Gupta", email: "sneha@example.com", phone: "+91 65432 10987", status: "active" },
  { name: "Vikram Nair", email: "vikram@example.com", phone: "+91 54321 09876", status: "inactive" },
  { name: "Anjali Singh", email: "anjali@example.com", phone: "+91 43210 98765", status: "active" },
  { name: "Karan Mehta", email: "karan@example.com", phone: "+91 32109 87654", status: "active" },
  { name: "Divya Rao", email: "divya@example.com", phone: "+91 21098 76543", status: "active" },
  { name: "Manish Joshi", email: "manish@example.com", phone: "+91 10987 65432", status: "active" },
  { name: "Pooja Iyer", email: "pooja@example.com", phone: "+91 09876 54321", status: "active" },
];

const drivers = [
  { name: "Ramesh Kumar", email: "ramesh@driver.com", phone: "+91 91234 56789", vehicleType: "bike", vehicleNumber: "DL 01 AB 1234", rating: "4.8", status: "active", totalEarnings: "45200.50", totalRides: 312 },
  { name: "Suresh Singh", email: "suresh@driver.com", phone: "+91 82345 67890", vehicleType: "auto", vehicleNumber: "DL 02 CD 5678", rating: "4.6", status: "active", totalEarnings: "38750.00", totalRides: 245 },
  { name: "Mohan Das", email: "mohan@driver.com", phone: "+91 73456 78901", vehicleType: "cab", vehicleNumber: "DL 03 EF 9012", rating: "4.9", status: "active", totalEarnings: "72100.75", totalRides: 421 },
  { name: "Rajesh Yadav", email: "rajesh@driver.com", phone: "+91 64567 89012", vehicleType: "bike", vehicleNumber: "DL 04 GH 3456", rating: "4.4", status: "active", totalEarnings: "29800.25", totalRides: 189 },
  { name: "Amit Tiwari", email: "amit@driver.com", phone: "+91 55678 90123", vehicleType: "cab", vehicleNumber: "DL 05 IJ 7890", rating: "4.7", status: "inactive", totalEarnings: "55600.00", totalRides: 334 },
  { name: "Deepak Mishra", email: "deepak@driver.com", phone: "+91 46789 01234", vehicleType: "auto", vehicleNumber: "DL 06 KL 2345", rating: "4.5", status: "active", totalEarnings: "41300.50", totalRides: 278 },
];

const pickups = ["Connaught Place", "India Gate", "Lajpat Nagar", "Saket", "Nehru Place", "Karol Bagh"];
const destinations = ["Airport T3", "AIIMS", "IIT Delhi", "Dwarka Sector 21", "Gurugram Cyber City", "Noida Sector 18"];
const vehicleTypes = ["bike", "auto", "cab"];
const rideModes = ["standard", "premium", "pool"];
const statuses = ["completed", "completed", "completed", "cancelled", "in_progress", "pending"];

async function seed() {
  console.log("Seeding database...");

  const existingUsers = await db.select().from(usersTable).limit(1);
  if (existingUsers.length > 0) {
    console.log("Database already seeded, skipping.");
    process.exit(0);
  }

  const insertedUsers = await db.insert(usersTable).values(users).returning();
  console.log(`Inserted ${insertedUsers.length} users`);

  const insertedDrivers = await db.insert(driversTable).values(drivers).returning();
  console.log(`Inserted ${insertedDrivers.length} drivers`);

  const rides = [];
  const now = new Date();
  for (let i = 0; i < 80; i++) {
    const daysAgo = Math.floor(Math.random() * 30);
    const hoursAgo = Math.floor(Math.random() * 24);
    const rideDate = new Date(now);
    rideDate.setDate(rideDate.getDate() - daysAgo);
    rideDate.setHours(rideDate.getHours() - hoursAgo);

    const userId = insertedUsers[Math.floor(Math.random() * insertedUsers.length)].id;
    const driver = insertedDrivers[Math.floor(Math.random() * insertedDrivers.length)];
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const vehicleType = vehicleTypes[Math.floor(Math.random() * vehicleTypes.length)];
    const price = (Math.random() * 400 + 50).toFixed(2);

    rides.push({
      userId,
      driverId: status !== "pending" ? driver.id : null,
      pickup: pickups[Math.floor(Math.random() * pickups.length)],
      destination: destinations[Math.floor(Math.random() * destinations.length)],
      vehicleType,
      rideMode: rideModes[Math.floor(Math.random() * rideModes.length)],
      price,
      status,
      createdAt: rideDate,
    });
  }

  const insertedRides = await db.insert(ridesTable).values(rides).returning();
  console.log(`Inserted ${insertedRides.length} rides`);

  console.log("Seeding complete!");
  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
