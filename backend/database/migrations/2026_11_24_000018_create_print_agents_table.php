<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('print_agents', function (Blueprint $table) {
            $table->char('id', 26)->primary();
            $table->char('tenant_id', 26);
            $table->char('shop_id', 26);
            $table->string('device_name', 255);
            $table->string('device_uuid', 255)->nullable();
            $table->string('machine_guid', 255)->nullable();
            $table->string('public_key_hash', 255);
            $table->string('agent_token_hash', 255)->nullable();
            $table->string('agent_token', 255)->nullable(); // Plain or hashed token alias
            $table->string('status', 32)->default('offline'); // offline, online, busy, revoked, active, paired
            $table->timestamp('last_seen_at')->nullable();
            $table->string('pairing_code', 32)->nullable();
            $table->timestamp('pairing_code_expires_at')->nullable();
            $table->timestamp('pairing_expires_at')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('tenants')->onDelete('cascade');
            $table->foreign('shop_id')->references('id')->on('shops')->onDelete('cascade');

            $table->index(['tenant_id', 'status']);
            $table->index('pairing_code');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('print_agents');
    }
};
