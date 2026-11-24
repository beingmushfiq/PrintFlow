<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tenant_domains', function (Blueprint $table) {
            $table->char('id', 26)->primary();
            $table->char('tenant_id', 26);
            $table->string('host')->unique();
            $table->string('type', 32)->default('standalone_host'); // platform_subdomain, custom_domain, standalone_host
            $table->string('verification_status', 32)->default('verified'); // pending, verified, failed
            $table->string('verification_token_hash', 64)->nullable();
            $table->timestamp('verified_at')->nullable();
            $table->string('tls_status', 32)->default('active'); // pending, active, error
            $table->boolean('is_primary')->default(true);
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('tenants')->onDelete('cascade');
            $table->index(['tenant_id', 'is_primary']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tenant_domains');
    }
};
