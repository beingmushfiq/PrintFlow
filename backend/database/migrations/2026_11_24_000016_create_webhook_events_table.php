<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('webhook_events', function (Blueprint $table) {
            $table->char('id', 26)->primary();
            $table->string('provider', 32);
            $table->string('connection_scope_id', 64)->nullable();
            $table->string('provider_event_id', 128)->nullable();
            $table->string('event_type', 64);
            $table->boolean('signature_valid')->default(false);
            $table->timestamp('received_at')->useCurrent();
            $table->timestamp('processed_at')->nullable();
            $table->string('processing_status', 32)->default('received');
            $table->string('payload_hash', 64);
            $table->json('redacted_payload_json')->nullable();
            $table->string('failure_code', 64)->nullable();
            $table->timestamps();

            $table->index(['provider', 'provider_event_id']);
            $table->index(['processing_status']);
            $table->index(['payload_hash']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('webhook_events');
    }
};
