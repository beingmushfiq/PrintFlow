<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Http\Responses\ApiResponse;
use Illuminate\Pagination\LengthAwarePaginator;
use Tests\TestCase;

class ApiEnvelopeTest extends TestCase
{
    public function test_api_health_endpoint_returns_standard_envelope(): void
    {
        $response = $this->getJson('/api/v1/health');

        $response->assertStatus(200);
        $response->assertHeader('X-Correlation-ID');

        $json = $response->json();
        $this->assertArrayHasKey('data', $json);
        $this->assertArrayHasKey('meta', $json);
        $this->assertArrayHasKey('errors', $json);

        $this->assertSame('healthy', $json['data']['status']);
        $this->assertNotEmpty($json['meta']['correlation_id']);
        $this->assertNotEmpty($json['meta']['timestamp']);
        $this->assertSame([], $json['errors']);
    }

    public function test_correlation_id_is_preserved_when_passed_in_header(): void
    {
        $customId = 'test-custom-correlation-12345';
        $response = $this->withHeader('X-Correlation-ID', $customId)
            ->getJson('/api/v1/health');

        $response->assertStatus(200);
        $response->assertHeader('X-Correlation-ID', $customId);

        $json = $response->json();
        $this->assertSame($customId, $json['meta']['correlation_id']);
    }

    public function test_404_error_formatting_envelope(): void
    {
        $response = $this->getJson('/api/v1/non-existent-endpoint');

        $response->assertStatus(404);
        $response->assertHeader('X-Correlation-ID');

        $json = $response->json();
        $this->assertNull($json['data']);
        $this->assertNotEmpty($json['meta']['correlation_id']);
        $this->assertNotEmpty($json['meta']['timestamp']);
        $this->assertNotEmpty($json['errors']);
        $this->assertSame('NOT_FOUND', $json['errors'][0]['code']);
    }

    public function test_api_paginated_response(): void
    {
        $items = collect([['id' => 1, 'name' => 'Item 1'], ['id' => 2, 'name' => 'Item 2']]);
        $paginator = new LengthAwarePaginator($items, 20, 2, 1);

        $response = ApiResponse::paginated($paginator);
        $data = $response->getData(true);

        $this->assertCount(2, $data['data']);
        $this->assertSame(20, $data['meta']['pagination']['total']);
        $this->assertSame(1, $data['meta']['pagination']['current_page']);
        $this->assertSame(10, $data['meta']['pagination']['total_pages']);
        $this->assertSame([], $data['errors']);
    }
}
