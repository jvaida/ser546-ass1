const AWS = require('aws-sdk');
require('aws-sdk/lib/maintenance_mode_message').suppress = true;
const readline = require('readline');

const awsDeetsInput = {};

// Return promise of asking question
const askQuestion = (query) => {
    return new Promise((resolve) => rl.question(query, resolve));
};

// Reading accessKeyId & secretAccessKey from cmd line input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

// Put all inputs in an object
async function putInputsInObject() {
    awsDeetsInput.accessKeyId = await askQuestion("Enter AWS access key id: ");
    awsDeetsInput.secretAccessKey = await askQuestion("Enter AWS secret access key id: ");
  
    rl.close();
    instructions();
}

putInputsInObject();

// CSE546 Assignment main steps
async function instructions() {
    AWS.config.update({
        accessKeyId: awsDeetsInput.accessKeyId,
        secretAccessKey: awsDeetsInput.secretAccessKey,
        region: 'us-east-1',
    });

    // console.log('AWS config set');
    // console.log('accessKeyId: ', awsDeetsInput.accessKeyId);
    // console.log('secretAccessKey: ', awsDeetsInput.secretAccessKey);

    const ec2 = new AWS.EC2();
    const s3 = new AWS.S3();
    const sqs = new AWS.SQS();

    // Dynamically generated bucket name
    const bucketName = `bucket1-${Date.now()}`;

    // Create AWS Resources
    await createEC2(ec2);
    await createS3(s3, bucketName);
    await createSQS(sqs);

    console.log("Request sent, wait for 1 min");

    // Wait for 1 minute
    await new Promise(resolve => setTimeout(resolve, 3000));

    // List all resources
    await listAll(ec2, s3, sqs);

    // Upload file to S3
    await s3.upload({
        Bucket: bucketName,
        Key: "CSE546test.txt",
        Body: "",
    }, function (err, data) {
        if (err) {
            console.log("Error", err);
        }
        if (data) {
            console.log("Upload Success", data.Location);
        }
    }).promise();

    // Perform SQS Operations
    await queueStuff("https://sqs.us-east-1.amazonaws.com/339885026049/queue1");

    // Wait for 10 seconds before deletion
    console.log('Waiting for 10 seconds');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Delete all resources
    await deletionAndListSteps(ec2, s3, sqs);
}

// create ec2
async function createEC2(ec2) {
    const params = {
        ImageId: 'ami-014d544cfef21b42d',
        InstanceType: 't2.micro',
        MinCount: 1,
        MaxCount: 1,
    };

    try {
        const data = await ec2.runInstances(params).promise();
        const instanceId = data.Instances[0].InstanceId;
        console.log(`Created instance with ID: ${instanceId}`);
    } catch (err) {
        console.error("Error creating instance", err);
    }
}

// create s3 bucket
async function createS3(s3, bucketName) {
    try {
        await s3.createBucket({ Bucket: bucketName }).promise();
        console.log("Bucket created successfully");
    } catch (err) {
        console.error("Error creating bucket:", err);
    }
}

// create sqs queue
async function createSQS(sqs) {
    try {
        await sqs.createQueue({ QueueName: 'queue1' }).promise();
        console.log("Queue created successfully");
    } catch (err) {
        console.error("Error creating queue:", err);
    }
}


async function listAll(ec2, s3, sqs) {
    // List EC2 instances
    try {
        const data = await ec2.describeInstances().promise();
        console.log("Instances information:");
        data.Reservations.forEach((reservation) => {
            reservation.Instances.forEach((instance) => {
                console.log(`- Instance ID: ${instance.InstanceId}`);
                console.log(`  State: ${instance.State.Name}`);
                console.log(`  Instance Type: ${instance.InstanceType}`);
                console.log(`  Launch Time: ${instance.LaunchTime}`);
            });
        });
    } catch (err) {
        console.error("Error retrieving instances:", err);
    }

    // List S3 buckets
    try {
        const data = await s3.listBuckets().promise();
        console.log("Buckets information:");
        data.Buckets.forEach((bucket) => {
            console.log(`- Bucket Name: ${bucket.Name}`);
        });
    } catch (err) {
        console.error("Error retrieving buckets:", err);
    }

    // List SQS queues
    try {
        const data = await sqs.listQueues().promise();
        console.log("Queues information:");
        data.QueueUrls.forEach((queueUrl) => {
            console.log(`- Queue URL: ${queueUrl}`);
        });
    } catch (err) {
        console.error("Error retrieving queues:", err);
    }
}

// last queue stuff
async function queueStuff(queueUrl) {
    const sqs = new AWS.SQS();
    try {
        // Send a message
        const sendParams = {
            QueueUrl: queueUrl,
            MessageBody: 'This is a test message',
            MessageAttributes: {
                'Name': {
                    DataType: 'String',
                    StringValue: 'test message',
                },
            },
        };
        const sendResult = await sqs.sendMessage(sendParams).promise();
        console.log('Message sent successfully:', sendResult.MessageId);

        // Check message count in queue
        const listParams = {
            QueueUrl: queueUrl,
            AttributeNames: ['ApproximateNumberOfMessages'],
        };
        const listResult = await sqs.getQueueAttributes(listParams).promise();
        console.log('Number of messages in the queue:', listResult.Attributes.ApproximateNumberOfMessages);

        // Receive a message
        const receiveParams = {
            QueueUrl: queueUrl,
            MaxNumberOfMessages: 10,
            MessageAttributeNames: ['All'],
            WaitTimeSeconds: 5,
        };
        const receiveResult = await sqs.receiveMessage(receiveParams).promise();
        if (receiveResult.Messages) {
            receiveResult.Messages.forEach((message) => {
                if (message.MessageAttributes && message.MessageAttributes.Name) {
                    console.log('Message Title:', message.MessageAttributes.Name.StringValue);
                    console.log('Message Body:', message.Body);
                } else {
                    console.log('No Message Title found.');
                }
            });
        } else {
            console.log('No messages available.');
        }

        // Check message count in queue again
        const finalListResult = await sqs.getQueueAttributes(listParams).promise();
        console.log('Number of messages in the queue:', finalListResult.Attributes.ApproximateNumberOfMessages);

    } catch (err) {
        console.log('Error:', err);
    }
}
const deleteAllEC2Instances = async (ec2) => {
    try {
      const data = await ec2.describeInstances().promise();
      const instanceIds = data.Reservations.flatMap(reservation => 
        reservation.Instances.map(instance => instance.InstanceId)
      );
  
      if (instanceIds.length > 0) {
        await ec2.terminateInstances({ InstanceIds: instanceIds }).promise();
        console.log(`Terminated EC2 instances: ${instanceIds.join(', ')}`);
      } else {
        console.log('No EC2 instances to delete.');
      }
    } catch (err) {
      console.error('Error deleting EC2 instances:', err);
    }
  };
  

  const deleteAllS3Buckets = async (s3) => {
    try {
      const data = await s3.listBuckets().promise();
      for (const bucket of data.Buckets) {
        const bucketName = bucket.Name;
        try {
          const objectsData = await s3.listObjectsV2({ Bucket: bucketName }).promise();
          const objects = objectsData.Contents.map(object => ({ Key: object.Key }));
  
          if (objects.length > 0) {
            await s3.deleteObjects({
              Bucket: bucketName,
              Delete: { Objects: objects }
            }).promise();
            console.log(`Deleted objects in bucket: ${bucketName}`);
          }
  
          await s3.deleteBucket({ Bucket: bucketName }).promise();
          console.log(`Deleted bucket: ${bucketName}`);
        } catch (err) {
          console.error(`Error deleting bucket or its contents (${bucketName}):`, err);
        }
      }
    } catch (err) {
      console.error('Error listing or deleting S3 buckets:', err);
    }
  };
  
const deleteAllSQSQueues = async (sqs) => {
    try {
    const data = await sqs.listQueues().promise();
    if (data.QueueUrls) {
        for (const queueUrl of data.QueueUrls) {
        await sqs.deleteQueue({ QueueUrl: queueUrl }).promise();
        console.log(`Deleted SQS queue: ${queueUrl}`);
        }
    } else {
        console.log('No SQS queues to delete.');
    }
    } catch (err) {
    console.error('Error deleting SQS queues:', err);
    }
};

const listEC2Instances = async (ec2) => {
    try {
    const data = await ec2.describeInstances().promise();
    const instanceIds = data.Reservations.flatMap(reservation => 
        reservation.Instances.map(instance => instance.InstanceId)
    );
    console.log('Remaining EC2 instances:', instanceIds.length > 0 ? instanceIds.join(', ') : 'None');
    } catch (err) {
    console.error('Error listing EC2 instances:', err);
    }
};

const listS3Buckets = async (s3) => {
try {
  const data = await s3.listBuckets().promise();
  console.log('Remaining S3 buckets:', data.Buckets.length > 0 ? data.Buckets.map(bucket => bucket.Name).join(', ') : 'None');
} catch (err) {
  console.error('Error listing S3 buckets:', err);
}
};

const listSQSQueues = async (sqs) => {
try {
  const data = await sqs.listQueues().promise();
  console.log('Remaining SQS queues:', data.QueueUrls ? data.QueueUrls.join(', ') : 'None');
} catch (err) {
  console.error('Error listing SQS queues:', err);
}
};


// delete all
async function deletionAndListSteps(ec2, s3, sqs) {
    console.log('Deleting all EC2 instances');
    await deleteAllEC2Instances(ec2);

    console.log('Deleting all S3 buckets');
    await deleteAllS3Buckets(s3);

    console.log('Deleting all SQS queues');
    await deleteAllSQSQueues(sqs);

    console.log('Waiting for 20 seconds');
    await new Promise(resolve => setTimeout(resolve, 20000));

    console.log('\nShow remaining EC2 instances');
    await listEC2Instances(ec2);

    console.log('\nShow remaining S3 buckets');
    await listS3Buckets(s3);

    console.log('\nShow remaining SQS queues');
    await listSQSQueues(sqs);
}