<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payments', function (Blueprint $table) {
            $table->char('id', 26)->primary();
            $table->char('tenant_id', 26)->nullable();
            $table->char('shop_id', 26)->nullable();
            $table->char('order_id', 26)->nullable();
            $table->char('subscription_invoice_id', 26)->nullable();
            $table->char('gateway_account_id', 26)->nullable();
            $table->string('purpose', 32)->default('print_order');
            $table->string('provider', 32);
            $table->string('provider_order_id', 128)->nullable();
            $table->string('provider_payment_id', 128)->nullable();
            $table->string('provider_transaction_id', 128)->nullable();
            $table->string('internal_reference', 64)->unique();
            $table->string('currency', 3)->default('BDT');
            $table->unsignedBigInteger('amount_minor')->default(0);
            $table->unsignedBigInteger('fee_minor')->default(0);
            $table->unsignedBigInteger('net_minor')->default(0);
            $table->string('status', 32)->default('created');
            $table->timestamp('verified_at')->nullable();
            $table->timestamp('captured_at')->nullable();
            $table->timestamp('failed_at')->nullable();
            $table->json('raw_result_redacted_json')->nullable();
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('tenants')->nullOnDelete();
            $table->foreign('shop_id')->references('id')->on('shops')->nullOnDelete();
            $table->foreign('order_id')->references('id')->on('orders')->nullOnDelete();
            $table->foreign('gateway_account_id')->references('id')->on('gateway_accounts')->nullOnDelete();

            $table->index(['tenant_id', 'order_id']);
            $table->index(['provider', 'provider_transaction_id']);
            $table->index(['tenant_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payments');
    }
};
