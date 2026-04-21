import { MongoClient, Db, Collection, ObjectId } from 'mongodb'

// MongoDB configuration
const MONGO_URL = process.env.MONGO_URL || 'mongodb://brain-mongo:27017'
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'ai4kb_brain'
const MONGO_COLLECTION = 'skill_docs'

let client: MongoClient | null = null
let db: Db | null = null

/**
 * Initialize MongoDB connection
 */
export async function initMongoDB(): Promise<Db> {
  if (db) return db

  client = new MongoClient(MONGO_URL)
  await client.connect()
  db = client.db(MONGO_DB_NAME)
  
  // Create index on name field for fast lookups
  await db.collection(MONGO_COLLECTION).createIndex({ name: 1 }, { unique: true })
  
  console.log(`MongoDB connected: ${MONGO_DB_NAME}/${MONGO_COLLECTION}`)
  return db
}

/**
 * Get the MongoDB database instance
 */
export function getMongoDB(): Db {
  if (!db) {
    throw new Error('MongoDB not initialized. Call initMongoDB() first.')
  }
  return db
}

/**
 * Get the skill_docs collection
 */
export function getSkillDocsCollection(): Collection<SkillDoc> {
  return getMongoDB().collection<SkillDoc>(MONGO_COLLECTION)
}

/**
 * Skill document stored in MongoDB
 */
export interface SkillDoc {
  _id?: ObjectId
  name: string
  rawMarkdown: string
  createdAt: Date
  updatedAt: Date
}

/**
 * Create or update a skill document
 */
export async function upsertSkillDoc(name: string, rawMarkdown: string): Promise<ObjectId> {
  const collection = getSkillDocsCollection()
  const now = new Date()
  
  const result = await collection.updateOne(
    { name },
    {
      $set: { rawMarkdown, updatedAt: now },
      $setOnInsert: { name, createdAt: now }
    },
    { upsert: true }
  )
  
  if (result.upsertedId) {
    return result.upsertedId
  }
  
  // Get existing doc _id
  const doc = await collection.findOne({ name })
  return doc!._id!
}

/**
 * Get a skill document by name
 */
export async function getSkillDocByName(name: string): Promise<SkillDoc | null> {
  const collection = getSkillDocsCollection()
  return collection.findOne({ name })
}

/**
 * Get all skill documents
 */
export async function getAllSkillDocs(): Promise<SkillDoc[]> {
  const collection = getSkillDocsCollection()
  return collection.find({}).toArray()
}

/**
 * Delete a skill document by name
 */
export async function deleteSkillDoc(name: string): Promise<boolean> {
  const collection = getSkillDocsCollection()
  const result = await collection.deleteOne({ name })
  return result.deletedCount > 0
}

/**
 * Close MongoDB connection
 */
export async function closeMongoDB(): Promise<void> {
  if (client) {
    await client.close()
    client = null
    db = null
  }
}
