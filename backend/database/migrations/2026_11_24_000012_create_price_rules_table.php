<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('price_rules', function (Blueprint $table) {
            $table->char('id', 26)->primary();
            $table->char('tenant_id', 26);
            $table->char('price_profile_id', 26);
            $table->string('service_code', 64)->default('page_print');
            $table->string('media_code', 64)->default('paper_a4');
            $table->string('color_mode', 32)->default('mono');
            $table->string('sides_mode', 32)->default('simplex');
            $table->string('unit_basis', 32)->default('printed_side');
            $table->unsignedBigInteger('unit_price_minor')->default(0);
            $table->unsignedInteger('minimum_quantity')->default(1);
            $table->unsignedInteger('maximum_quantity')->nullable();
            $table->boolean('is_active')->default(true);
            $table->json('rule_json')->nullable();
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('tenants')->onDelete('cascade');
            $table->foreign('price_profile_id')->references('id')->on('price_profiles')->onDelete('cascade');

            $table->index(['tenant_id', 'price_profile_id']);
            $table->index(['tenant_id', 'media_code', 'color_mode', 'sides_mode']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('price_rules');
    }
};
