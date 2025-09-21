// Perform3D MCP Integration Test Suite
// Run with: node test/integration.test.js

import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_URL = process.env.P3D_SERVER_URL || 'http://localhost:8732';
const TEMPLATE_FILE = process.env.P3D_TEMPLATE || 'C:/p3d-mcp/templates/frame_template.p3d';
const WORK_DIR = process.env.P3D_WORK_DIR || 'C:/p3d-mcp/work';

// Ensure work directory exists
if (!existsSync(WORK_DIR)) {
  mkdirSync(WORK_DIR, { recursive: true });
}

// Test utilities
class TestRunner {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.sessionId = null;
  }

  async run() {
    console.log('\n🧪 Perform3D MCP Integration Test Suite');
    console.log('=' . repeat(50));
    console.log(`Server: ${SERVER_URL}`);
    console.log(`Template: ${TEMPLATE_FILE}`);
    console.log(`Work Dir: ${WORK_DIR}\n`);

    await this.testServerHealth();
    await this.testConnect();
    await this.testModelCreation();
    await this.testModelBuilding();
    await this.testAnalysis();
    await this.testResults();
    await this.testCleanup();

    this.printSummary();
  }

  async testServerHealth() {
    await this.test('Server Health Check', async () => {
      const response = await this.apiCall('GET', '/api/logs/recent');
      if (!response.ok && !response.items) {
        throw new Error('Server not responding correctly');
      }
      return `Server is healthy (${response.items?.length || 0} log entries)`;
    });
  }

  async testConnect() {
    await this.test('Connect to Perform3D', async () => {
      const response = await this.apiCall('POST', '/api/project/connect');
      if (!response.ok && !response.version) {
        throw new Error('Failed to connect to Perform3D');
      }
      this.sessionId = response.sessionId;
      return `Connected to Perform3D ${response.version}`;
    });
  }

  async testModelCreation() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.modelPath = join(WORK_DIR, `test_model_${timestamp}.p3d`);

    await this.test('Create Model from Template', async () => {
      if (existsSync(TEMPLATE_FILE)) {
        const response = await this.apiCall('POST', '/api/project/new-from-template', {
          templatePath: TEMPLATE_FILE,
          newPath: this.modelPath
        });
        return `Model created at ${this.modelPath}`;
      } else {
        // Fallback: create empty model
        const response = await this.apiCall('POST', '/api/project/new', {
          path: this.modelPath
        });
        return `Empty model created at ${this.modelPath}`;
      }
    });

    await this.test('Set Model Info', async () => {
      await this.apiCall('POST', '/api/model/set-info', {
        title: 'Integration Test Model',
        units: { length: 'cm', force: 'kN' }
      });
      return 'Model info updated';
    });
  }

  async testModelBuilding() {
    await this.test('Add Nodes', async () => {
      const nodes = this.generateNodes();
      const response = await this.apiCall('POST', '/api/model/add-nodes', {
        items: nodes
      });
      return `Added ${response.count || nodes.length} nodes`;
    });

    await this.test('Add Material', async () => {
      await this.apiCall('POST', '/api/component/add-material', {
        name: 'C30',
        type: 'concrete',
        properties: { fc: 30, Ec: 30000 }
      });
      return 'Material C30 defined';
    });

    await this.test('Add Cross Section', async () => {
      await this.apiCall('POST', '/api/component/add-cross-section', {
        name: 'Col_40x40',
        shape: 'rectangle',
        dimensions: { width: 40, height: 40 }
      });
      return 'Section Col_40x40 defined';
    });

    await this.test('Add Component', async () => {
      await this.apiCall('POST', '/api/component/add-component', {
        name: 'ElasticColumn',
        type: 'elastic_column',
        material: 'C30',
        section: 'Col_40x40'
      });
      return 'Component ElasticColumn defined';
    });

    await this.test('Add Elements', async () => {
      const elements = this.generateElements();
      const response = await this.apiCall('POST', '/api/model/add-elements', {
        items: elements
      });
      return `Added ${response.count || elements.length} elements`;
    });

    await this.test('Define Load Pattern', async () => {
      await this.apiCall('POST', '/api/load/define-pattern', {
        name: 'Dead',
        type: 'dead',
        factor: 1.0
      });
      return 'Load pattern Dead defined';
    });

    await this.test('Apply Nodal Loads', async () => {
      const topNodes = [201, 202, 203, 204];
      for (const nodeId of topNodes) {
        await this.apiCall('POST', '/api/load/set-nodal', {
          nodeId,
          pattern: 'Dead',
          fz: -100
        });
      }
      return `Applied loads to ${topNodes.length} nodes`;
    });

    await this.test('Save Model', async () => {
      await this.apiCall('POST', '/api/project/save');
      return 'Model saved';
    });
  }

  async testAnalysis() {
    await this.test('Define Analysis Series', async () => {
      await this.apiCall('POST', '/api/analysis/define-series', {
        name: 'Gravity',
        type: 'gravity',
        loadPatterns: ['Dead']
      });
      return 'Analysis series Gravity defined';
    });

    await this.test('Run Analysis', async () => {
      const response = await this.apiCall('POST', '/api/analysis/run-series', {
        name: 'Gravity'
      });

      if (response.progressToken) {
        // Could monitor progress via SSE if needed
        this.progressToken = response.progressToken;
      }

      if (response.result?.summary) {
        return `Analysis completed: ${JSON.stringify(response.result.summary)}`;
      }
      return 'Analysis completed';
    });
  }

  async testResults() {
    await this.test('Get Node Displacement', async () => {
      const response = await this.apiCall('GET', '/api/results/nodeDisp?nodeId=201&series=Gravity');
      if (!response.data) {
        throw new Error('No displacement data returned');
      }
      return `Retrieved ${response.data.length} displacement records`;
    });

    await this.test('Get Support Reactions', async () => {
      const response = await this.apiCall('GET', '/api/results/supportReaction?series=Gravity');
      if (!response.data) {
        throw new Error('No reaction data returned');
      }
      return `Retrieved ${response.data.length} reaction records`;
    });

    await this.test('Export Results', async () => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const exportPath = join(WORK_DIR, `test_export_${timestamp}.csv`);
      const response = await this.apiCall('GET',
        `/api/export/table?tableType=reactions&path=${encodeURIComponent(exportPath)}&series=Gravity`);

      if (response.data?.path) {
        this.exportPath = response.data.path;
        return `Results exported to ${response.data.path}`;
      }
      return 'Export completed';
    });
  }

  async testCleanup() {
    await this.test('Close Model', async () => {
      await this.apiCall('POST', '/api/project/close');
      return 'Model closed';
    });

    // Optional: Clean up test files
    if (process.env.CLEANUP === 'true') {
      const { unlink } = await import('fs/promises');
      if (this.modelPath && existsSync(this.modelPath)) {
        await unlink(this.modelPath);
      }
      if (this.exportPath && existsSync(this.exportPath)) {
        await unlink(this.exportPath);
      }
      console.log('\n🧹 Test files cleaned up');
    }
  }

  // Helper methods
  generateNodes() {
    return [
      { id: 101, x: 0, y: 0, z: 0 },
      { id: 102, x: 300, y: 0, z: 0 },
      { id: 103, x: 300, y: 400, z: 0 },
      { id: 104, x: 0, y: 400, z: 0 },
      { id: 201, x: 0, y: 0, z: 300 },
      { id: 202, x: 300, y: 0, z: 300 },
      { id: 203, x: 300, y: 400, z: 300 },
      { id: 204, x: 0, y: 400, z: 300 }
    ];
  }

  generateElements() {
    return [
      { id: 'C1', type: 'column', nodes: [101, 201], property: 'ElasticColumn' },
      { id: 'C2', type: 'column', nodes: [102, 202], property: 'ElasticColumn' },
      { id: 'C3', type: 'column', nodes: [103, 203], property: 'ElasticColumn' },
      { id: 'C4', type: 'column', nodes: [104, 204], property: 'ElasticColumn' }
    ];
  }

  async apiCall(method, endpoint, body = null) {
    const url = `${SERVER_URL}${endpoint}`;
    const options = {
      method,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok && !data.ok) {
      throw new Error(`API Error: ${data.error?.message || 'Unknown error'}`);
    }

    return data;
  }

  async test(name, fn) {
    process.stdout.write(`\n📝 ${name}... `);
    try {
      const result = await fn();
      console.log(`✅ ${result || 'OK'}`);
      this.passed++;
    } catch (error) {
      console.log(`❌ Failed`);
      console.error(`   Error: ${error.message}`);
      this.failed++;
    }
  }

  printSummary() {
    console.log('\n' + '=' . repeat(50));
    console.log('📊 Test Summary');
    console.log(`   ✅ Passed: ${this.passed}`);
    console.log(`   ❌ Failed: ${this.failed}`);
    console.log(`   📈 Total:  ${this.passed + this.failed}`);

    if (this.failed === 0) {
      console.log('\n🎉 All tests passed!');
      process.exit(0);
    } else {
      console.log('\n⚠️  Some tests failed');
      process.exit(1);
    }
  }
}

// Run tests
const runner = new TestRunner();
runner.run().catch(error => {
  console.error('\n💥 Test runner error:', error);
  process.exit(1);
});