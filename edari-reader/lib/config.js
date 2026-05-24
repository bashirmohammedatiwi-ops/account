const path = require('path');

module.exports = {
  port: process.env.PORT || 3847,
  edariRoot: process.env.EDARI_ROOT || 'D:\\Future of Technology\\EdariNX',
  dataRoot: process.env.DATA_ROOT || 'D:\\Future of Technology\\EdariNX\\Data',
  nexusAdminUrl: process.env.NEXUS_ADMIN_URL || 'http://127.0.0.1:10088',
  defaultServer: process.env.NX_SERVER || '127.0.0.1',
  defaultPort: Number(process.env.NX_PORT || 16000),
  odbcDriverCandidates: [
    'Devart ODBC Driver for NexusDB',
    'NexusDB V4 ODBC Driver',
    'NexusDB V3 ODBC Driver',
    'NexusDB V1 ODBC Driver',
    'NexusDB ODBC Driver'
  ]
};
