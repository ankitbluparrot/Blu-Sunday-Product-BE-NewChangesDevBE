const express = require('express');
const router = express.Router();
const ProjectTemplate = require('../models/ProjectTemplate');
const authMiddleware = require("../middlewares/authMiddleware");
const permissionMiddleware = require("../middlewares/permissionMiddleware");  

// Create a new project template
router.post('/create', authMiddleware, permissionMiddleware('create_project'), async (req, res) => {
    try {
        const { projectName, tasks } = req.body;
        console.log('projectName and tasks template', projectName, tasks);
        
        // Check if template already exists
        const existingTemplate = await ProjectTemplate.findOne({ projectName }); 
        if (existingTemplate) {
            return res.status(400).json({ message: "Template with this name already exists" });
        }

        // Process tasks to remove expectedDuration
        const processedTasks = tasks.map(task => ({
            taskName: task.taskName,
            subtasks: task.subtasks.map(subtask => ({
                name: subtask.name
            }))
        }));

        const template = new ProjectTemplate({
            projectName,
            tasks: processedTasks
        }); 

        await template.save();
        res.status(201).json({ message: "Template created successfully", template });
    } catch (error) {
        console.error("Error creating template:", error);
        res.status(500).json({ message: "Error creating template", error: error.message });
    }
});

// Get all templates 
router.get('/all', authMiddleware, async (req, res) => {
    try {
        const templates = await ProjectTemplate.find();
        res.status(200).json(templates);
    } catch (error) {
        console.error("Error fetching templates:", error);
        res.status(500).json({ message: "Error fetching templates", error: error.message });
    }
});

// Get template by project name
router.get('/:projectName', authMiddleware, async (req, res) => {
    try {
        const template = await ProjectTemplate.findOne({ 
            projectName: req.params.projectName 
        });
        
        if (!template) {
            return res.status(404).json({ message: "Template not found" });
        }
        
        res.status(200).json(template);
    } catch (error) {
        console.error("Error fetching template:", error);
        res.status(500).json({ message: "Error fetching template", error: error.message });
    }
});

// Update template by project name
router.put('/update/:projectName', authMiddleware, permissionMiddleware('create_project'), async (req, res) => {
    try {
        const { projectName, expectedDuration, tasks } = req.body;
        const templateName = req.params.projectName;

        // Find the template
        const template = await ProjectTemplate.findOne({ projectName: templateName });
        
        if (!template) {
            return res.status(404).json({ message: "Template not found" });
        }

        // If projectName is being changed, check if new name already exists
        if (projectName && projectName !== templateName) {
            const existingTemplate = await ProjectTemplate.findOne({ projectName });
            if (existingTemplate) {
                return res.status(400).json({ message: "Template with this name already exists" });
            }
        }

        // Update the template
        if (projectName) template.projectName = projectName;
        if (expectedDuration) template.expectedDuration = expectedDuration;
        if (tasks) template.tasks = tasks;

        await template.save();

        res.status(200).json({ 
            message: "Template updated successfully", 
            template 
        });
    } catch (error) {
        console.error("Error updating template:", error);
        res.status(500).json({ message: "Error updating template", error: error.message });
    }
});

// Delete template by project name
router.delete('/delete/:projectName', authMiddleware, permissionMiddleware('create_project'), async (req, res) => {
    try {
        const templateName = req.params.projectName;

        // Find and delete the template
        const deletedTemplate = await ProjectTemplate.findOneAndDelete({ projectName: templateName });
        
        if (!deletedTemplate) {
            return res.status(404).json({ message: "Template not found" });
        }

        res.status(200).json({ 
            message: "Template deleted successfully",
            deletedTemplate
        });
    } catch (error) {
        console.error("Error deleting template:", error);
        res.status(500).json({ message: "Error deleting template", error: error.message });
    }
});

module.exports = router; 