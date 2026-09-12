import { AadHttpClient } from '@microsoft/sp-http';
import type { AadHttpClientFactory, HttpClientResponse } from '@microsoft/sp-http';
import { FLOW_SERVICE_RESOURCE } from './draftService';
import type { IDraftHttpClient, IDraftHttpResponse } from './draftService';

/**
 * Adapts the framework's Entra-authenticated client to the draft service. The token is requested
 * for the Power Automate service audience, which is what an OAuth-protected HTTP trigger validates.
 */
export function createFlowClientFactory(factory: AadHttpClientFactory): () => Promise<IDraftHttpClient> {
  return async (): Promise<IDraftHttpClient> => {
    const client: AadHttpClient = await factory.getClient(FLOW_SERVICE_RESOURCE);
    return {
      post: async (url: string, body: string): Promise<IDraftHttpResponse> => {
        const response: HttpClientResponse = await client.post(url, AadHttpClient.configurations.v1, {
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body
        });
        return response;
      }
    };
  };
}
