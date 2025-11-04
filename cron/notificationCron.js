const cron = require("node-cron");
const Task = require("../models/Task1");  
const { sendNotification } = require("../services/notificationService");
const {sendPusherNotification} = require('../PusherNotification/Pusher');
const moment = require("moment");
const {io} = require('../server');


// Cron job that runs every hour
// 0 * * * *
// */2 * * * *

/* 
const now = new Date(); // Current time
const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now

const tasksDueSoon = await Task.find({
  dueDate: { 
    $gte: now,  // Due date should be after the current time
    $lt: next24Hours // Due date should be before 24 hours from now
  }
});

console.log(tasksDueSoon);

*/

cron.schedule("*/1 * * * *", async () => {

//    console.log(req.user.id);

    try {
        // const now = moment(); 
        const now = new Date();
        console.log('schedular is running...');

        // Find tasks whose deadline is within the next 24 hours
        const next24Hours = new Date(Date.now() + 24 * 60 * 60 * 1000); 
        const tasks = await Task.find({
        dueDate: { $gte: now, $lt: next24Hours }, 
        }).populate("assignee");  

        console.log('task', tasks);       

        // tasks.forEach(async (task) => {
        //     if (task.assignee) {
        //         const message = `The deadline for your task "${task.taskId}" is approaching!`;

        //         console.log('message: ', message);
               
        //         // await sendNotification(
        //         //     task.assignee._id,
        //         //     message,
        //         //     `/tasks/${task._id}`  
        //         // );
        //     }
        // });

       
        tasks.forEach(async (task) => {
            // task.assignees.forEach(async (assignee) => {
                if(task.assignee){
                const message = `The deadline for your task "${task.taskId}" is approaching!`;

                console.log("Sending message:", message);

                sendPusherNotification(task.assignee._id, "You task deadline is near", task.dueDate, task.prograss, task.taskId);

                // sendPushBeamNotification("user-123", "You task deadline is near and this is beam notification")

                  
                await sendNotification(
                    task.assignee._id,
                    message,
                    `/tasks/${task._id}`
                );
            }
            // });
        });
            

        console.log("Deadline notifications sent successfully.");
    } catch (error) {
        console.error("Error sending deadline notifications:", error);
    }
});
