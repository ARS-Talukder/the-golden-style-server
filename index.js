const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const nodemailer = require('nodemailer');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.n78isr1.mongodb.net/?retryWrites=true&w=majority`;


const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: 'UnAuthorized access' });
  }
  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: 'Forbidden access' })
    }
    req.decoded = decoded;
    next();
  });
}

// ----------TransactionId Email Sending-----------
const emailClient = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_SENDER,
    pass: process.env.EMAIL_SENDER_PASS
  },
  port: 465,
  host: 'smtp.gmail.com'

})
function sendTransactionIdEmail(payment) {
  const { clientEmail, clientName, transactionId, service, date, slot } = payment;
  const email = {
    from: process.env.EMAIL_SENDER,
    to: clientEmail,
    subject: 'Your Payment is completed',
    text: 'Your Payment is completed',
    html: `
          <div>
             <p style="margin-bottom:0px">Hello,</p>
             <p style="margin-top:0px">${clientName}</p>
             <p>Your payment is completed for <span style="font-weight:bold">${service}</span> on <span style="font-weight:bold">${date}</span> at <span style="font-weight:bold">${slot}</span></p>
             <h3><span style="text-decoration:underline">Your Transaction Id:</span> <span style="color:red">${transactionId}</span></h3>
             <p>THE GOLDEN STYLE team is really happy to have you as member</p>
             <p>For more information, Visit <a href="https://the-golden-style.netlify.app/">https://the-golden-style.netlify.app/</a></p>
             
             <p>Thank You</p>
          </div>
    `
  };
  emailClient.sendMail(email, (error, info) => {
    if (error) {
      return console.log(error);
    }
    else {
      return console.log('Email Sent');
    }
  })
}

async function run() {
  try {
    await client.connect();
    const serviceCollection = client.db('the-golden-style').collection('services');
    const barberCollection = client.db('the-golden-style').collection('barbers');
    const appointmentCollection = client.db('the-golden-style').collection('appointments');
    const reviewCollection = client.db('the-golden-style').collection('reviews');
    const userCollection = client.db('the-golden-style').collection('users');
    const managerCollection = client.db('the-golden-style').collection('managers');
    const featureCollection = client.db('the-golden-style').collection('features');
    const paymentCollection = client.db('the-golden-style').collection('payments');


    //Get All Services
    app.get('/services', async (req, res) => {
      const services = await serviceCollection.find().toArray();
      res.send(services);
    });

    //Post Service
    app.post('/services', async (req, res) => {
      const newService = req.body;
      const result = await serviceCollection.insertOne(newService);
      res.send(result);
    })

    //Get Service by name
    app.get('/service', async (req, res) => {
      const name = req.query.name;
      const query = { service_name: name };
      const service = await serviceCollection.findOne(query);
      res.send(service);
    })


    //Get All Barbers
    app.get('/barbers', async (req, res) => {
      const barbers = await barberCollection.find().toArray();
      res.send(barbers);
    })

    //Get Barber by id
    app.get('/barber/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await barberCollection.findOne(query);
      res.send(result);
    })

    //Post Appointment
    app.post('/appointments', async (req, res) => {
      const appointment = req.body;

      ///This is for preventing the multiple entry of same service and client
      const query = { appointment_date: appointment.appointment_date, appointment_barber: appointment.appointment_barber, appointment_slot: appointment.appointment_slot };
      const exist = await appointmentCollection.findOne(query);
      if (exist) {
        return res.send({ success: false, appointment: exist })
      }


      const result = await appointmentCollection.insertOne(appointment);
      return res.send({ success: true, result });
    })

    //Get All Appointments By Date
    app.get('/appointments', verifyJWT, async (req, res) => {
      const date = req.query.date;
      const query = { appointment_date: date };
      const appointments = await appointmentCollection.find(query).toArray();
      res.send(appointments);
    })

    //Get Appointments by Email
    app.get('/myAppointments', verifyJWT, async (req, res) => {
      const email = req.query.email;
      const decodedEmail = req.decoded.email;
      if (email === decodedEmail) {
        const query = { email: email };
        const appointments = await appointmentCollection.find(query).toArray();
        res.send(appointments);
      }
      else {
        return res.status(403).send({ message: 'forbidden access' });
      }

    })

    //Delete Appointment
    app.delete('/appointment-delete', async (req, res) => {
      const id = req.query.id;
      const query = { _id: ObjectId(id) };
      const result = await appointmentCollection.deleteOne(query);
      res.send(result);

    })

    //Get Appointment by id for payment
    app.get('/appointment/:id', verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const appointment = await appointmentCollection.findOne(query);
      res.send(appointment);
    })

    //Get My Customer Appointments
    app.get('/myCustomerAppointments', verifyJWT, async (req, res) => {
      const email = req.query.email;
      const date = req.query.date;
      const emailQuery = { barber_email: email };
      const barber = await barberCollection.findOne(emailQuery);
      const barberName = barber?.barber_name;
      const query = { appointment_date: date, appointment_barber: barberName }
      const appointments = await appointmentCollection.find(query).toArray();
      res.send(appointments);


    })

    //Available Appointment
    app.get('/available', async (req, res) => {
      const date = req.query.date;

      const barbers = await barberCollection.find().toArray();

      const query = { appointment_date: date };
      const appointments = await appointmentCollection.find(query).toArray();

      barbers.forEach(barber => {
        const barberAppointments = appointments.filter(appointment => appointment.appointment_barber === barber.barber_name);

        const bookedSlot = barberAppointments.map(s => s.appointment_slot);

        const available = barber.slots.filter(slot => !bookedSlot.includes(slot));
        barber.slots = available;
      })

      res.send(barbers);

    })

    //Get All Features
    app.get('/features', async (req, res) => {
      const features = await featureCollection.find().toArray();
      res.send(features);
    })

    //Get All Reviews
    app.get('/reviews', async (req, res) => {
      const reviews = await reviewCollection.find().toArray();
      res.send(reviews);
    })

    //Get My Customers Reviews
    app.get('/myCustomerReviews', verifyJWT, async (req, res) => {
      const email = req.query.email;
      const emailQuery = { barber_email: email };
      const barber = await barberCollection.findOne(emailQuery);
      const barberName = barber?.barber_name;
      const query = { barber_name: barberName };
      const reviews = await reviewCollection.find(query).toArray();
      res.send(reviews);
    })

    //Get Reviews by Barber Name for About Route
    app.get('/reviewsByBarber', async (req, res) => {
      const barber_name = req.query.name;
      const query = { barber_name: barber_name };
      const reviews = await reviewCollection.find(query).toArray();
      res.send(reviews);
    })

    //Post Review
    app.post('/reviews', async (req, res) => {
      const newReview = req.body;
      const result = await reviewCollection.insertOne(newReview);
      res.send(result);
    })

    //Get All Users
    app.get('/users', verifyJWT, async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    })

    //Post User
    app.put('/users/:email', async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET);
      res.send({ result, token });
    })

    //Put Image to User or Update User
    app.put('/user/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      const updatedUser = req.body;
      const query = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          img: updatedUser.img
        }
      };
      const result = await userCollection.updateOne(query, updateDoc, options);
      res.send(result);
    })

    //Get User By Email
    app.get('/user', verifyJWT, async (req, res) => {
      const email = req.query.email;
      const decodedEmail = req.decoded.email;
      if (email === decodedEmail) {
        const query = { email: email };
        const user = await userCollection.findOne(query);
        res.send(user);
      }
      else {
        return res.status(403).send({ message: 'forbidden access' });
      }

    })

    //Check Manager or not
    app.get('/manager/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });
      const isManager = user.role === 'manager';
      res.send({ admin: isManager })
    })

    //Post Manager
    app.post('/barbers', verifyJWT, async (req, res) => {
      const newBarber = req.body;
      const result = await barberCollection.insertOne(newBarber);
      res.send(result);
    })

    //Give Barber Access
    app.put('/users/manager/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({ email: requester });
      if (requesterAccount.role === 'manager') {
        const filter = { email: email };
        const updateDoc = {
          $set: { role: 'barber' },
        };
        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
      else {
        res.status(403).send({ message: 'Forbidden access' });
      }

    })

    //Remove Barber Access.
    app.put('/users/remove/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({ email: requester });
      if (requesterAccount.role === 'manager') {
        const filter = { email: email };
        const updateDoc = {
          $set: { role: '' },
        };
        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
      else {
        res.status(403).send({ message: 'Forbidden access' });
      }

    })

    //Get All Managers
    app.get('/managers', async (req, res) => {
      const managers = await managerCollection.find().toArray();
      res.send(managers);
    })

    //Check Chairman or not
    app.get('/chairman/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });
      const isAdmin = user.position === 'chairman';
      res.send({ admin: isAdmin })
    })

    //Post Manager
    app.post('/managers', verifyJWT, async (req, res) => {
      const newManager = req.body;
      const result = await managerCollection.insertOne(newManager);
      res.send(result);
    })

    //Give Manager Access
    app.put('/users/chairman/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({ email: requester });
      if (requesterAccount.position === 'chairman') {
        const filter = { email: email };
        const updateDoc = {
          $set: { role: 'manager' },
        };
        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
      else {
        res.status(403).send({ message: 'Forbidden access' });
      }

    })

    //Remove Manager Access
    app.put('/users/remove/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({ email: requester });
      if (requesterAccount.position === 'chairman') {
        const filter = { email: email };
        const updateDoc = {
          $set: { role: '' },
        };
        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
      else {
        res.status(403).send({ message: 'Forbidden access' });
      }

    })

    // Check Barber or not
    app.get('/checkbarber/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });
      const isBarber = user.role === 'barber';
      res.send({ admin: isBarber })
    })


    // ---------------------Payment Section-----------------------

    //Payment Intent
    app.post('/create-payment-intent', verifyJWT, async (req, res) => {
      const service = req.body;
      const price = service.price;
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });
      res.send({ clientSecret: paymentIntent.client_secret });
    })

    //Update Appointment payment from due to paid and add transaction id and send email
    app.patch('/appointment-update', verifyJWT, async (req, res) => {
      const id = req.query.id;
      const payment = req.body;
      const query = { _id: ObjectId(id) };
      const updatedDoc = {
        $set: {
          payment: 'paid',
          transactionId: payment.transactionId
        }
      }
      const result = await paymentCollection.insertOne(payment);
      const updatedAppointment = await appointmentCollection.updateOne(query, updatedDoc);
      sendTransactionIdEmail(payment);
      res.send(updatedDoc)

    })




  } finally {

  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('This is Homepage');
});

app.listen(port, () => {
  console.log('The Port is Running nicely', port);
})