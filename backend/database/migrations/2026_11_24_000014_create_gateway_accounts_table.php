<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('gateway_accounts', function (Blueprint $table) {
            $table->char('id', 26)->primary();
            $table->char('tenant_id', 26);
            $table->char('shop_id', 26)->nullable();
            $table->string('purpose', 32)->default('customer_orders');
            $table->string('provider', 32);
            $table->string('country', 3)->default('BGD');
            $table->string('currency', 3)->default('BDT');
            $table->string('environment', 32)->default('sandbox');
            $table->string('merchant_identifier', 128);
            $table->text('credentials_ciphertext');
            $table->text('webhook_secret_ciphertext')->nullable();
            $table->string('status', 32)->default('active');
            $table->timestamp('last_verified_at')->nullable();
            $table->string('last_error_code', 64)->nullable();
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('tenants')->onDelete('cascade');
            $table->foreign('shop_id')->references('id')->on('shops')->onDelete('cascade');

            $table->index(['tenant_id', 'provider', 'status']);
            $table->index(['tenant_id', 'shop_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('gateway_accounts');
    }
};
