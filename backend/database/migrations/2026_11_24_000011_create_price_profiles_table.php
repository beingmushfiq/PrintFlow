<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('price_profiles', function (Blueprint $table) {
            $table->char('id', 26)->primary();
            $table->char('tenant_id', 26);
            $table->char('shop_id', 26)->nullable();
            $table->string('name');
            $table->string('currency', 3)->default('BDT');
            $table->string('status', 32)->default('active');
            $table->timestamp('effective_from')->nullable();
            $table->timestamp('effective_until')->nullable();
            $table->unsignedBigInteger('minimum_order_minor')->default(0);
            $table->unsignedBigInteger('service_fee_minor')->default(0);
            $table->string('tax_mode', 32)->default('exclusive');
            $table->unsignedInteger('tax_rate_basis_points')->default(0);
            $table->unsignedInteger('calculation_version')->default(1);
            $table->char('created_by', 26)->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->foreign('tenant_id')->references('id')->on('tenants')->onDelete('cascade');
            $table->foreign('shop_id')->references('id')->on('shops')->onDelete('cascade');

            $table->index(['tenant_id', 'status']);
            $table->index(['tenant_id', 'shop_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('price_profiles');
    }
};
