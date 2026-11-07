// Minimal Node-RED settings for the traffic system
module.exports = {
    flowFile: 'flows.json',
    flowFilePretty: true,
    uiPort: process.env.PORT || 1880,
    // Credentials are not used by these flows; a fixed secret keeps restarts quiet.
    credentialSecret: process.env.NODE_RED_CREDENTIAL_SECRET || 'traffic-demo-secret',
    functionExternalModules: false,
    // Uncomment to protect the editor:
    // adminAuth: { type: 'credentials', users: [{ username: 'admin', password: '<bcrypt hash>', permissions: '*' }] },
    logging: { console: { level: 'info', metrics: false, audit: false } },
    editorTheme: { projects: { enabled: false } }
};
