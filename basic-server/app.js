const cors = require('cors');
const express = require('express');
const fetch = require('node-fetch');


// **** set constants for later use ****
const localListenPort = process.env.PORT || 32019;

// **** define the public proxy URL (to use in the Subscription - blank for local only) ****
const publicUrl = '';

// **** define the FHIR server URL ****
const fhirServerUrl = 'https://server.subscriptions.argo.run';

// **** patient ID to use in this example - will be created if it doesn't exist ****
const patientId = 'DevDays00120';

// **** our subscription id (once created) ****
var subscriptionId = '';

/** Function that runs this sever (required to be in function for async/await) */
async function run() {

  // **** start our local HTTP server ****

  startHttpListener();

  // **** get a list of Topic resources ****

  let topics = await getTopics();

  if (topics.length < 1) {
    console.log('Failed to get Topics!');
    process.exit(1);
  }

  // **** list topics in the console ****

  console.log('Found Topics:');
  topics.forEach(topic => {
    console.log(` Topic/${topic.id} - ${topic.title}: ${topic.description}`);
  });

  // **** make sure our patient exists ****

  if (!await createPatientIfRequired()) {
    console.log(`Failed to verify patient: Patient/${patientId}`);
    process.exit(1);
  }

  // **** create our subscription ****

  if (!await createSubscription(topics[0])) {
    console.log('Failed to create subscription!');
    process.exit(1);
  }

  // **** post an encounter ****


  // **** delete our subscription ****

  await deleteSubscription();
}

// **** run our server ***

run();

async function deleteSubscription() {
  let url = new URL(`Subscription/${subscriptionId}`, fhirServerUrl);

  try {
    let response = await(fetch(url, {
      method: 'DELETE',
      headers: {
        'Accept': 'application/fhir+json',
        'Prefer': 'return=representation',
      }
    }));

    if (response.ok) {
      console.log(`Deleted subscription: Subscription/${subscriptionId}`);
      subscriptionId = '';
    }
    return response.ok;
  } catch (err) {
    return false;
  }
}

/** Create a subscription on the server */
async function createSubscription(topic) {
  // **** create our subscription object ****

  let subscription = {
    resourceType: 'Subscription',
    channel: {
      endpoint: publicUrl ? publicUrl : `http://localhost:${localListenPort}/notification`,
      header: [],
      heartbeatPeriod: 60,
      payload: {
        content: 'id-only',
        contentType: 'application/fhir+json',
      },
      type: {
        coding: [ {
          code: 'rest-hook',
          display: 'Rest Hook',
          system: 'http://terminology.hl7.org/CodeSystem/subscription-channel-type'
        }],
        text: 'REST Hook',
      },
    },
    filterBy: [{
      matchType: '=',
      name: 'patient',
      value: `Patient/${patientId}`,
    }],
    end: '',
    topic: {reference: topic.topicUrl},
    reason: 'DevDays Example - Node',
    status: 'requested'
  }
  
  // *** build the URL to POST this subscription ****

  let url = new URL('Subscription', fhirServerUrl).toString();

  try {
    let response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/fhir+json',
        'Content-Type': 'application/fhir+json;charset=utf-8',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(subscription),
    });
    
    if (!response.ok) {
      return false;
    }

    // **** grab the body ****
    
    let body = await response.text();

    // **** parse the body ****

    let sub = JSON.parse(body);

    // **** grab the id so we can clean up ****

    subscriptionId = sub.id;

    // **** log ****

    console.log(`Created subscription: Subscription/${subscriptionId}`);

    // **** success ****

    return true;
  } catch (err) {
    console.log(`createSubscription: ${err}`);
    return false;
  }
}


/** Get a Bundle of Topics from a FHIR server */
async function getTopics() {
  // **** build the URL to the server ****

  let url = new URL('Topic', fhirServerUrl).toString();

  try {
    // **** fetch the Topics ****

    let response = await fetch(url, {
      method: 'GET',
      headers: {'Accept': 'application/fhir+json'},
    });
    let body = await response.text();

    // **** check for success ****

    if (!response.ok) {
      return [];
    }

    // **** parse the JSON ****

    let bundle = JSON.parse(body);
    let topics = [];

    // **** check for values ****

    if (!bundle.entry) {
      return [];
    }

    // **** traverse topics ****

    bundle.entry.forEach(entry => {
      if (!entry.resource) return;

      topics.push(entry.resource);
    });

    // **** return our list ****

    return topics;
  } catch (err) {
    console.log(`getTopics: ${err}`);
    return [];
  }
}

/** Creates a patient record in case we need one */
async function createPatientIfRequired() {
  // **** build the URL to check for our patient ****

  let url = new URL(`Patient/${patientId}`, fhirServerUrl);

  let response = await fetch(url, {
    method: 'GET',
    headers: {'Accept': 'application/fhir+json'},
  });
  let body = await response.text();

  // **** check for failure ****

  if (!response.ok) {
    return (await createPatient());
  }

  // **** parse the JSON ****

  let bundle = JSON.parse(body);
  
  // **** check for values ***

  if (!bundle.entry) {
    return (await createPatient());
  }

  if (bundle.entry.length === 0) {
    return (await createPatient());
  }

  // **** done ****

  return true;
}

/** Create a basic patient on the FHIR server via PUT */
async function createPatient() {
  // **** build a basic patient record ****

  let patient = {
    resourceType: 'Patient',
    id: patientId,
    name: [{
      family: 'Patient',
      given: ['DevDays'],
      use: 'official',
    }],
    gender: 'unknown',
    birthDate: '2019-11-20'
  };

  // *** build the URL for this patient ****

  let url = new URL(`Patient/${patientId}?_format=json`, fhirServerUrl).toString();

  try {
    let response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Accept': 'application/fhir+json',
        'Content-Type': 'application/fhir+json;charset=utf-8',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(patient),
    });

    if (!response.ok) {
      console.log(`createPatient: url: ${url} returned: ${response.status}`)
    }
    
    // **** check for success ****

    return response.ok;
  } catch (err) {
    console.log(`createPatient: ${err}`);
    return false;
  }
}


/** Configure and Start the HTTP listener */
function startHttpListener() {

  // **** build our app ****

  const app = express();

  // **** use CORS (default is allow everything when enabled) ****

  app.use(cors());

  // **** have express decode URLs ****

  app.use(
    express.urlencoded({
      extended: true
    })
  );

  // **** have express do basic JSON parsing ****

  app.use(express.json());

  // **** configure root handler people can make sure it works ****

  app.get('/', async (req, res) => {
    res.send('Server is alive and listening...');
  });

  // **** configure 404 handler ****

  // eslint-disable-next-line no-unused-vars
  app.use(function(req, res, next) {
    res.status(404).send('404 - Not Found');
  });

  // **** listen on the default port or the one sepcified ****

  app.listen(
    localListenPort, 
    () => console.log(`Listening on http://localhost:${localListenPort}`)
  );
}
