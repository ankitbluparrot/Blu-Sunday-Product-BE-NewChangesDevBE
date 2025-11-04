const Pusher = require("pusher");
const PushNotifications = require('@pusher/push-notifications-server');

const pusher = new Pusher({
  appId: "1966052",
  key: "884f4731b463a32c1759",
  secret: "f7f1a3f1c4b451b82290",
  cluster: "ap2", // Check the cluster in your Pusher app dashboard
  useTLS: true, // Ensure connection is secure
});

const beamsClient = new PushNotifications({
    instanceId: '53e4de1a-cfa6-4015-bc99-10bc3a0134f8', 
    secretKey: 'F46CD0ECFD2D5E1F180D53A31369AE42DBF014049F6811E608078F6B35AED500',
  });

// Send real-time notifications to a specific channel
const sendPusherNotification = async (userId, message, dueDate, prograss, taskId) => {
  const channel = `user-${userId}`; 
// const channel = `user-67e3a0295a7adcd1fa91011c`;

   // Create a unique channel for each user

  // Trigger the notification event on that user's channel
  pusher.trigger(channel, "new-notification", {
    message: message,
    dueDate: dueDate,
    prograss: prograss,
    taskId: taskId
  });
};


// const sendPushBeamNotification = async (userId, message) => {

//     console.log("userID", userId);

//     try {
//       const publishResponse = await beamsClient.publishToUsers([userId], {
//         web: {
//           notification: {
//             title: "New Notification",
//             body: message,
//           },
//         },
//       });
//       console.log("Push notification sent:", publishResponse);
//     } catch (err) {
//       console.error("Error sending push notification:", err);
//     }  
//   };



module.exports = { sendPusherNotification};

