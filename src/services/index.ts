/**
 * Shared Services Index - Singleton Pattern Implementation
 * 
 * This file provides centralized access to singleton service instances
 * to prevent memory leaks from multiple service instantiation.
 * 
 * Benefits:
 * - Single instance per service across the entire application
 * - Reduced memory usage and resource consumption
 * - Shared state and configuration
 * - Better performance (no duplicate initializations)
 */

import { AgentService } from './agentService.js';
import { AuthService } from './authService.js';

/**
 * Singleton AgentService instance
 * 
 * This instance is shared across all routes:
 * - /api/chat
 * - /api/tasks  
 * - /api/validation
 * 
 * Prevents creation of multiple AgentService instances which would
 * each create their own MemoryService, AgentFactory, etc.
 */
export const agentService = AgentService.getInstance();

/**
 * Singleton AuthService instance
 * 
 * This instance is shared across all authentication routes:
 * - /api/auth
 * - All protected routes via middleware
 * 
 * Prevents creation of multiple AuthService instances.
 */
export const authService = AuthService.getInstance();

/**
 * Initialize all singleton services
 * 
 * Call this function once at application startup to ensure
 * all services are properly initialized.
 */
export async function initializeServices(): Promise<void> {
  console.log('🚀 Initializing singleton services...');
  
  try {
    // Initialize AgentService
    await agentService.initialize();
    console.log('✅ AgentService singleton initialized');
    
    // AuthService doesn't need async initialization
    console.log('✅ AuthService singleton ready');
    
    console.log('🎉 All singleton services initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing singleton services:', error);
    throw error;
  }
}

/**
 * Reset all singleton instances (useful for testing)
 */
export function resetAllServices(): void {
  console.log('🔄 Resetting all singleton services...');
  
  AgentService.resetInstance();
  AuthService.resetInstance();
  
  console.log('✅ All singleton services reset');
}

/**
 * Get service statistics for monitoring
 */
export function getServiceStats(): {
  agentServiceCreated: boolean;
  authServiceCreated: boolean;
} {
  return {
    agentServiceCreated: agentService !== null,
    authServiceCreated: authService !== null,
  };
}