<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('orders', function (Blueprint $table) {
            $table->char('id', 26)->primary();
            $table->char('tenant_id', 26);
            $table->char('shop_id', 26);
            $table->string('public_reference', 64)->unique();
            $table->string('public_token_hash', 64)->unique();
            $table->string('customer_name')->nullable();
            $table->string('customer_phone', 32); // Locked Decision #3: Mandatory customer phone
            $table->string('customer_email')->nullable();
            $table->string('status', 32)->default('draft');
            $table->string('currency', 3)->default('BDT');
            $table->unsignedBigInteger('subtotal_minor')->default(0);
            $table->unsignedBigInteger('tax_minor')->default(0);
            $table->unsignedBigInteger('fee_minor')->default(0);
            $table->unsignedBigInteger('discount_minor')->default(0);
            $table->unsignedBigInteger('total_minor')->default(0);
            $table->json('quote_snapshot_json')->nullable();
            $table->string('source', 32)->default('qr');
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('tenants')->onDelete('cascade');
            $table->foreign('shop_id')->references('id')->on('shops')->onDelete('cascade');

            $table->index(['tenant_id', 'shop_id', 'created_at']);
            $table->index(['tenant_id', 'status', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('orders');
    }
};
