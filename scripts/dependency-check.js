#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Comprehensive dependency checker for BoomCard platform
 * Ensures all services have proper dependencies before build/deploy
 */

const SERVICES = [
  'api-gateway',
  'auth-service',
  'user-service',
  'analytics-service',
  'ml-service',
  'event-processor',
  'query-service',
  'notification-service',
  'storage-service',
  'scheduler-service',
  'monitoring-service',
  'reporting-service',
  'partner-dashboard',
  'customer-portal',
  'admin-panel'
];

const REQUIRED_DEPENDENCIES = {
  // Backend services (NestJS)
  backend: {
    dependencies: [
      '@nestjs/common',
      '@nestjs/core',
      '@nestjs/platform-express',
      '@nestjs/config',
      '@nestjs/swagger',
      '@nestjs/microservices',
      'class-validator',
      'class-transformer',
      '@prisma/client',
      'bcrypt',
      'jsonwebtoken',
      'axios',
      'kafkajs',
      'ioredis',
      'winston'
    ],
    devDependencies: [
      '@nestjs/cli',
      '@nestjs/testing',
      '@types/node',
      '@types/express',
      '@types/jest',
      'typescript',
      'ts-node',
      'jest',
      'prisma'
    ]
  },
  // Frontend apps (React)
  frontend: {
    dependencies: [
      'react',
      'react-dom',
      'react-router-dom',
      '@tanstack/react-query',
      'axios',
      'styled-components',
      'react-hot-toast',
      'recharts',
      '@heroicons/react',
      'date-fns',
      'clsx'
    ],
    devDependencies: [
      '@types/react',
      '@types/react-dom',
      '@vitejs/plugin-react',
      'vite',
      'typescript',
      'vitest',
      '@testing-library/react',
      '@testing-library/jest-dom',
      'eslint'
    ]
  },
  // ML service (Python/FastAPI)
  python: {
    requirements: [
      'fastapi>=0.104.0',
      'uvicorn>=0.24.0',
      'pydantic>=2.5.0',
      'numpy>=1.24.0',
      'pandas>=2.0.0',
      'scikit-learn>=1.3.0',
      'tensorflow>=2.14.0',
      'torch>=2.1.0',
      'sqlalchemy>=2.0.0',
      'asyncpg>=0.29.0',
      'redis>=5.0.0',
      'httpx>=0.25.0',
      'prometheus-client>=0.19.0'
    ]
  }
};

class DependencyChecker {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.fixed = [];
  }

  checkService(servicePath, serviceName) {
    console.log(`\n🔍 Checking ${serviceName}...`);
    
    const fullPath = path.join(__dirname, '..', servicePath);
    if (!fs.existsSync(fullPath)) {
      this.errors.push(`Service directory not found: ${servicePath}`);
      return;
    }

    // Determine service type
    const packageJsonPath = path.join(fullPath, 'package.json');
    const requirementsPath = path.join(fullPath, 'requirements.txt');
    
    if (fs.existsSync(packageJsonPath)) {
      this.checkNodeService(fullPath, serviceName, packageJsonPath);
    } else if (fs.existsSync(requirementsPath)) {
      this.checkPythonService(fullPath, serviceName, requirementsPath);
    } else {
      this.warnings.push(`No package.json or requirements.txt found for ${serviceName}`);
    }
  }

  checkNodeService(servicePath, serviceName, packageJsonPath) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const isBackend = serviceName.includes('service') || serviceName === 'api-gateway';
    const requiredDeps = isBackend ? REQUIRED_DEPENDENCIES.backend : REQUIRED_DEPENDENCIES.frontend;
    
    // Check dependencies
    const currentDeps = Object.keys(packageJson.dependencies || {});
    const currentDevDeps = Object.keys(packageJson.devDependencies || {});
    
    const missingDeps = requiredDeps.dependencies.filter(dep => 
      !currentDeps.includes(dep) && !dep.includes('/')
    );
    
    const missingDevDeps = requiredDeps.devDependencies.filter(dep => 
      !currentDevDeps.includes(dep)
    );
    
    if (missingDeps.length > 0 || missingDevDeps.length > 0) {
      console.log(`  ⚠️  Missing dependencies in ${serviceName}`);
      
      // Auto-fix by updating package.json
      if (missingDeps.length > 0) {
        packageJson.dependencies = packageJson.dependencies || {};
        missingDeps.forEach(dep => {
          packageJson.dependencies[dep] = this.getLatestVersion(dep, isBackend);
        });
      }
      
      if (missingDevDeps.length > 0) {
        packageJson.devDependencies = packageJson.devDependencies || {};
        missingDevDeps.forEach(dep => {
          packageJson.devDependencies[dep] = this.getLatestVersion(dep, isBackend);
        });
      }
      
      // Write updated package.json
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
      this.fixed.push(`Updated package.json for ${serviceName}`);
      console.log(`  ✅ Fixed package.json for ${serviceName}`);
    } else {
      console.log(`  ✅ All dependencies present`);
    }
    
    // Check for scripts
    this.checkScripts(packageJson, serviceName, isBackend);
  }

  checkPythonService(servicePath, serviceName, requirementsPath) {
    const requirements = fs.readFileSync(requirementsPath, 'utf8').split('\n').filter(line => line.trim());
    const requiredPackages = REQUIRED_DEPENDENCIES.python.requirements;
    
    const currentPackages = requirements.map(req => req.split('>=')[0].split('==')[0].trim());
    const missingPackages = requiredPackages.filter(pkg => 
      !currentPackages.includes(pkg.split('>=')[0])
    );
    
    if (missingPackages.length > 0) {
      console.log(`  ⚠️  Missing Python packages in ${serviceName}`);
      
      // Auto-fix by updating requirements.txt
      const updatedRequirements = [...requirements, ...missingPackages].join('\n');
      fs.writeFileSync(requirementsPath, updatedRequirements);
      this.fixed.push(`Updated requirements.txt for ${serviceName}`);
      console.log(`  ✅ Fixed requirements.txt for ${serviceName}`);
    } else {
      console.log(`  ✅ All Python dependencies present`);
    }
  }

  checkScripts(packageJson, serviceName, isBackend) {
    const requiredScripts = {
      'dev': isBackend ? 'nest start --watch' : 'vite',
      'build': isBackend ? 'nest build' : 'tsc && vite build',
      'start': isBackend ? 'node dist/main' : 'vite preview',
      'test': isBackend ? 'jest' : 'vitest',
      'lint': 'eslint src --ext ts,tsx'
    };
    
    if (!packageJson.scripts) {
      packageJson.scripts = {};
    }
    
    let scriptsUpdated = false;
    Object.entries(requiredScripts).forEach(([script, command]) => {
      if (!packageJson.scripts[script]) {
        packageJson.scripts[script] = command;
        scriptsUpdated = true;
      }
    });
    
    if (scriptsUpdated) {
      const packageJsonPath = path.join(__dirname, '..', serviceName, 'package.json');
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
      console.log(`  ✅ Added missing scripts to ${serviceName}`);
    }
  }

  getLatestVersion(dependency, isBackend) {
    // Version mappings for common dependencies
    const versions = {
      // NestJS
      '@nestjs/common': '^10.0.0',
      '@nestjs/core': '^10.0.0',
      '@nestjs/platform-express': '^10.0.0',
      '@nestjs/config': '^3.1.0',
      '@nestjs/swagger': '^7.1.0',
      '@nestjs/microservices': '^10.0.0',
      '@nestjs/testing': '^10.0.0',
      '@nestjs/cli': '^10.0.0',
      '@nestjs/mapped-types': '^2.0.0',
      '@nestjs/jwt': '^10.0.0',
      
      // Common
      'typescript': '^5.3.0',
      'class-validator': '^0.14.0',
      'class-transformer': '^0.5.1',
      '@prisma/client': '^5.7.0',
      'prisma': '^5.7.0',
      'bcrypt': '^5.1.0',
      'jsonwebtoken': '^9.0.0',
      'axios': '^1.6.0',
      'kafkajs': '^2.2.4',
      'ioredis': '^5.3.2',
      'winston': '^3.11.0',
      
      // React
      'react': '^18.2.0',
      'react-dom': '^18.2.0',
      'react-router-dom': '^6.20.0',
      '@tanstack/react-query': '^5.0.0',
      'styled-components': '^6.1.0',
      'react-hot-toast': '^2.4.1',
      'recharts': '^2.10.0',
      '@heroicons/react': '^2.0.18',
      'date-fns': '^2.30.0',
      'clsx': '^2.0.0',
      
      // Dev dependencies
      '@types/react': '^18.2.0',
      '@types/react-dom': '^18.2.0',
      '@types/node': '^20.0.0',
      '@types/express': '^4.17.21',
      '@types/jest': '^29.5.0',
      '@types/bcrypt': '^5.0.0',
      '@types/jsonwebtoken': '^9.0.0',
      '@vitejs/plugin-react': '^4.2.0',
      'vite': '^5.0.0',
      'vitest': '^1.0.0',
      '@testing-library/react': '^14.1.0',
      '@testing-library/jest-dom': '^6.1.5',
      'jest': '^29.7.0',
      'ts-node': '^10.9.0',
      'eslint': '^8.55.0'
    };
    
    return versions[dependency] || 'latest';
  }

  generateQAReport() {
    const reportPath = path.join(__dirname, '..', 'QA_DEPENDENCY_REPORT.md');
    const timestamp = new Date().toISOString();
    
    let report = `# BoomCard Platform - QA Dependency Report
Generated: ${timestamp}

## Summary
- Services Checked: ${SERVICES.length}
- Errors Found: ${this.errors.length}
- Warnings: ${this.warnings.length}
- Auto-Fixed: ${this.fixed.length}

## Dependency Status

### ✅ Fixed Issues
${this.fixed.length > 0 ? this.fixed.map(fix => `- ${fix}`).join('\n') : 'No fixes applied.'}

### ❌ Errors
${this.errors.length > 0 ? this.errors.map(err => `- ${err}`).join('\n') : 'No errors found.'}

### ⚠️  Warnings
${this.warnings.length > 0 ? this.warnings.map(warn => `- ${warn}`).join('\n') : 'No warnings.'}

## Next Steps
1. Run \`npm install\` in each service directory
2. For Python services, run \`pip install -r requirements.txt\`
3. Run the build process to verify all dependencies work correctly

## CI/CD Integration
Add this script to your CI/CD pipeline:
\`\`\`yaml
- name: Check Dependencies
  run: node scripts/dependency-check.js
\`\`\`
`;
    
    fs.writeFileSync(reportPath, report);
    console.log(`\n📄 QA report generated: QA_DEPENDENCY_REPORT.md`);
  }

  run() {
    console.log('🚀 BoomCard Platform Dependency Checker\n');
    
    SERVICES.forEach(service => {
      this.checkService(service, service);
    });
    
    this.generateQAReport();
    
    console.log('\n✨ Dependency check complete!');
    if (this.fixed.length > 0) {
      console.log(`Fixed ${this.fixed.length} issues automatically.`);
    }
  }
}

// Run the checker
const checker = new DependencyChecker();
checker.run();