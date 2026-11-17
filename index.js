
import express from 'express'
import cors from 'cors'
import { MongoClient, ServerApiVersion } from 'mongodb'
import 'dotenv/config'

const app = express()
const port = process.env.PORT || 5000

const client = new MongoClient(process.env.MONGO_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})

app.use(express.json())
app.use(cors())

async function run() {
  try {
    await client.connect()

    await client.db('admin').command({ ping: 1 })

    console.log('You successfully connected to MongoDB!')

    const db = client.db('myDatabase')
    const items = db.collection('items')

    // GET API
    app.get('/items', async (req, res) => {
      try {
        const result = await items.find().toArray()
        res.send(result)
      } catch (error) {
        res.status(500).send({ message: 'Failed to fetch items' })
      }
    })

    // POST API
    app.post('/items', async (req, res) => {
      try {
        const result = await items.insertOne(req.body)
        res.send(result)
      } catch (error) {
        res.status(500).send({ message: 'Failed to insert item' })
      }
    })

    // Home API
    app.get('/', (req, res) => {
      res.send('Hello World')
    })

    // Start Server
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`)
    })

  } catch (error) {
    console.error('MongoDB connection failed:', error)
    process.exit(1)
  }
}

run()
